import { createCustomerSchema, createPaymentSchema, updateCustomerSchema } from "@shop-os/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { badRequest, notFound } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import { PaymentModel } from "../payments/payment.model.js";
import { SaleModel } from "../sales/sale.model.js";
import { roundMoney, serializeSale } from "../sales/sale.service.js";
import { CustomerModel } from "./customer.model.js";

export const customersRouter = Router({ mergeParams: true });

customersRouter.get(
  "/",
  requireAuth,
  requireShopMember("customer.view"),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const filter: Record<string, unknown> = { shopId, active: true };
      if (q) {
        filter.$or = [
          { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
          { phone: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) },
        ];
      }

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(startOfMonth.getTime() - 1);
      const overdueBefore = new Date(now);
      overdueBefore.setDate(overdueBefore.getDate() - 30);

      const [customers, totalCustomers, summaryAgg, receivedAgg, receivedLastMonthAgg, newThisMonth] =
        await Promise.all([
          CustomerModel.find(filter).sort({ updatedAt: -1 }).limit(200).lean(),
          CustomerModel.countDocuments({ shopId, active: true }),
          SaleModel.aggregate<{
            totalReceivable: number;
            overdueAmount: number;
            receivableCustomers: Array<Types.ObjectId | null>;
            overdueCustomers: Array<Types.ObjectId | null>;
          }>([
            {
              $match: {
                shopId,
                status: "COMPLETED",
                amountDue: { $gt: 0 },
                customerId: { $ne: null },
              },
            },
            {
              $group: {
                _id: null,
                totalReceivable: { $sum: "$amountDue" },
                overdueAmount: {
                  $sum: {
                    $cond: [
                      { $lt: ["$completedAt", overdueBefore] },
                      "$amountDue",
                      0,
                    ],
                  },
                },
                receivableCustomers: { $addToSet: "$customerId" },
                overdueCustomers: {
                  $addToSet: {
                    $cond: [
                      { $lt: ["$completedAt", overdueBefore] },
                      "$customerId",
                      null,
                    ],
                  },
                },
              },
            },
          ]),
          PaymentModel.aggregate<{ total: number }>([
            {
              $match: {
                shopId,
                status: "CONFIRMED",
                method: { $ne: "CREDIT" },
                receivedAt: { $gte: startOfMonth },
              },
            },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]),
          PaymentModel.aggregate<{ total: number }>([
            {
              $match: {
                shopId,
                status: "CONFIRMED",
                method: { $ne: "CREDIT" },
                receivedAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
              },
            },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]),
          CustomerModel.countDocuments({
            shopId,
            active: true,
            createdAt: { $gte: startOfMonth },
          }),
        ]);

      const dues = await SaleModel.aggregate<{
        _id: Types.ObjectId;
        due: number;
        lastPurchaseAt: Date;
        purchaseCount: number;
        purchaseTotal: number;
        lastInvoiceNumber: string;
      }>([
        {
          $match: {
            shopId,
            customerId: { $in: customers.map((c) => c._id) },
            status: "COMPLETED",
          },
        },
        { $sort: { completedAt: -1 } },
        {
          $group: {
            _id: "$customerId",
            due: { $sum: "$amountDue" },
            lastPurchaseAt: { $max: "$completedAt" },
            purchaseCount: { $sum: 1 },
            purchaseTotal: { $sum: "$total" },
            lastInvoiceNumber: { $first: "$invoiceNumber" },
          },
        },
      ]);
      const dueMap = new Map(dues.map((d) => [String(d._id), d]));

      const summaryRow = summaryAgg[0];
      const receivedThisMonth = roundMoney(receivedAgg[0]?.total ?? 0);
      const receivedLastMonth = roundMoney(receivedLastMonthAgg[0]?.total ?? 0);
      let receivedGrowthPct: number | null = null;
      if (receivedLastMonth > 0) {
        receivedGrowthPct = roundMoney(
          ((receivedThisMonth - receivedLastMonth) / receivedLastMonth) * 100,
        );
      } else if (receivedThisMonth > 0) {
        receivedGrowthPct = 100;
      }

      const overdueCustomerCount = (summaryRow?.overdueCustomers ?? []).filter(
        (id) => id != null,
      ).length;

      res.json({
        summary: {
          totalCustomers,
          totalReceivable: roundMoney(summaryRow?.totalReceivable ?? 0),
          receivableCustomerCount: summaryRow?.receivableCustomers?.length ?? 0,
          overdueAmount: roundMoney(summaryRow?.overdueAmount ?? 0),
          overdueCustomerCount,
          receivedThisMonth,
          receivedGrowthPct,
          newThisMonth,
        },
        customers: customers.map((c) => {
          const stats = dueMap.get(String(c._id));
          return {
            _id: String(c._id),
            name: c.name,
            phone: c.phone ?? null,
            notes: c.notes ?? null,
            outstandingDue: roundMoney(stats?.due ?? 0),
            lastPurchaseAt: stats?.lastPurchaseAt?.toISOString?.() ?? null,
            lastInvoiceNumber: stats?.lastInvoiceNumber ?? null,
            purchaseCount: stats?.purchaseCount ?? 0,
            purchaseTotal: roundMoney(stats?.purchaseTotal ?? 0),
          };
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.post(
  "/",
  requireAuth,
  requireShopMember("customer.view"),
  async (req, res, next) => {
    try {
      const body = createCustomerSchema.parse(req.body);
      const shopId = req.shopContext!.shopId;

      if (body.phone) {
        const existing = await CustomerModel.findOne({
          shopId,
          phone: body.phone,
        });
        if (existing) {
          res.status(200).json({ customer: serializeCustomer(existing) });
          return;
        }
      }

      const customer = await CustomerModel.create({
        shopId,
        name: body.name,
        phone: body.phone,
        notes: body.notes,
        creditLimit: body.creditLimit,
        active: true,
      });
      res.status(201).json({ customer: serializeCustomer(customer) });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.patch(
  "/:customerId",
  requireAuth,
  requireShopMember("customer.view"),
  async (req, res, next) => {
    try {
      const body = updateCustomerSchema.parse(req.body);
      const customer = await findCustomer(
        req.shopContext!.shopId,
        req.params.customerId,
      );

      if (body.name !== undefined) customer.name = body.name;
      if (body.phone !== undefined) customer.phone = body.phone;
      if (body.notes !== undefined) customer.notes = body.notes;
      if (body.creditLimit !== undefined) customer.creditLimit = body.creditLimit;

      await customer.save();
      res.json({ customer: serializeCustomer(customer) });
    } catch (err) {
      next(err);
    }
  },
);

customersRouter.get(
  "/:customerId",
  requireAuth,
  requireShopMember("customer.view"),
  async (req, res, next) => {
    try {
      const customer = await findCustomer(
        req.shopContext!.shopId,
        req.params.customerId,
      );
      const sales = await SaleModel.find({
        shopId: req.shopContext!.shopId,
        customerId: customer._id,
        status: "COMPLETED",
      })
        .sort({ completedAt: -1 })
        .limit(30)
        .lean();

      const payments = await PaymentModel.find({
        shopId: req.shopContext!.shopId,
        customerId: customer._id,
        status: "CONFIRMED",
      })
        .sort({ receivedAt: -1 })
        .limit(50)
        .lean();

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const overdueBefore = new Date(now);
      overdueBefore.setDate(overdueBefore.getDate() - 30);

      const purchaseTotal = roundMoney(
        sales.reduce((sum, sale) => sum + sale.total, 0),
      );
      const outstandingDue = roundMoney(
        sales.reduce((sum, sale) => sum + sale.amountDue, 0),
      );
      const overdueAmount = roundMoney(
        sales
          .filter(
            (sale) =>
              sale.amountDue > 0 &&
              sale.completedAt &&
              sale.completedAt < overdueBefore,
          )
          .reduce((sum, sale) => sum + sale.amountDue, 0),
      );
      const totalReceived = roundMoney(
        payments.reduce((sum, payment) => sum + payment.amount, 0),
      );
      const paidThisMonth = roundMoney(
        payments
          .filter(
            (payment) =>
              payment.receivedAt && payment.receivedAt >= startOfMonth,
          )
          .reduce((sum, payment) => sum + payment.amount, 0),
      );
      const receivableInvoices = sales.filter((sale) => sale.amountDue > 0).length;

      res.json({
        customer: {
          ...serializeCustomer(customer),
          outstandingDue,
          overdueAmount,
          purchaseTotal,
          purchaseCount: sales.length,
          totalReceived,
          paidThisMonth,
          receivableInvoices,
        },
        sales: sales.map(serializeSale),
        payments: payments.map((p, index) => ({
          _id: String(p._id),
          method: p.method,
          amount: p.amount,
          saleId: p.saleId ? String(p.saleId) : null,
          receivedAt: p.receivedAt?.toISOString?.(),
          reference:
            p.reference ??
            `${p.method}-${String(payments.length - index).padStart(4, "0")}`,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

/** Collect udhaar — allocates across open sales oldest-first; never creates a Sale */
customersRouter.post(
  "/:customerId/payments",
  requireAuth,
  requireShopMember("customer.credit"),
  async (req, res, next) => {
    try {
      const body = createPaymentSchema.parse(req.body);
      if (body.method === "CREDIT") {
        throw badRequest("Use Cash/UPI/Card to collect udhaar");
      }

      const shopId = req.shopContext!.shopId;
      const customer = await findCustomer(shopId, req.params.customerId);

      if (body.idempotencyKey) {
        const existing = await PaymentModel.findOne({
          shopId,
          idempotencyKey: body.idempotencyKey,
        });
        if (existing) {
          res.json({
            ok: true,
            allocated: [],
            paymentIds: [String(existing._id)],
            message: "Idempotent replay",
          });
          return;
        }
      }

      let remaining = roundMoney(body.amount);
      if (remaining <= 0) throw badRequest("Amount must be positive");

      const openSales = await SaleModel.find({
        shopId,
        customerId: customer._id,
        status: "COMPLETED",
        amountDue: { $gt: 0 },
      }).sort({ completedAt: 1 });

      const allocated: Array<{ saleId: string; amount: number }> = [];
      const paymentIds: string[] = [];

      for (const sale of openSales) {
        if (remaining <= 0) break;
        const apply = roundMoney(Math.min(remaining, sale.amountDue));

        const payment = await PaymentModel.create({
          shopId,
          saleId: sale._id,
          customerId: customer._id,
          method: body.method,
          amount: apply,
          status: "CONFIRMED",
          reference: body.reference,
          receivedAmount:
            body.method === "CASH" ? body.receivedAmount ?? apply : undefined,
          changeGiven:
            body.method === "CASH" && body.receivedAmount
              ? roundMoney(Math.max(0, body.receivedAmount - apply))
              : 0,
          receivedAt: new Date(),
          createdBy: req.user!._id,
          idempotencyKey:
            allocated.length === 0 ? body.idempotencyKey : undefined,
        });

        sale.amountPaid = roundMoney(sale.amountPaid + apply);
        sale.amountDue = roundMoney(Math.max(0, sale.total - sale.amountPaid));
        await sale.save();

        allocated.push({ saleId: String(sale._id), amount: apply });
        paymentIds.push(String(payment._id));
        remaining = roundMoney(remaining - apply);
      }

      if (allocated.length === 0) {
        throw badRequest("Is customer pe koi udhaar baaki nahi");
      }

      res.status(201).json({
        ok: true,
        allocated,
        paymentIds,
        unallocated: remaining,
        customerId: String(customer._id),
      });
    } catch (err) {
      next(err);
    }
  },
);

export const creditRouter = Router({ mergeParams: true });

creditRouter.get(
  "/",
  requireAuth,
  requireShopMember("customer.view"),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const rows = await SaleModel.aggregate<{
        _id: Types.ObjectId;
        due: number;
        salesCount: number;
      }>([
        {
          $match: {
            shopId,
            status: "COMPLETED",
            amountDue: { $gt: 0 },
            customerId: { $ne: null },
          },
        },
        {
          $group: {
            _id: "$customerId",
            due: { $sum: "$amountDue" },
            salesCount: { $sum: 1 },
          },
        },
        { $sort: { due: -1 } },
      ]);

      const customers = await CustomerModel.find({
        _id: { $in: rows.map((r) => r._id) },
      }).lean();
      const byId = new Map(customers.map((c) => [String(c._id), c]));

      const items = rows.map((r) => {
        const c = byId.get(String(r._id));
        return {
          customerId: String(r._id),
          name: c?.name ?? "Unknown",
          phone: c?.phone ?? null,
          outstandingDue: roundMoney(r.due),
          openSales: r.salesCount,
        };
      });

      res.json({
        items,
        totalOutstanding: roundMoney(
          items.reduce((s, i) => s + i.outstandingDue, 0),
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

async function findCustomer(shopId: Types.ObjectId, customerId: string) {
  if (!Types.ObjectId.isValid(customerId)) throw notFound("Customer not found");
  const customer = await CustomerModel.findOne({ _id: customerId, shopId });
  if (!customer) throw notFound("Customer not found");
  return customer;
}

function serializeCustomer(c: {
  _id: { toString(): string };
  name: string;
  phone?: string | null;
  notes?: string | null;
  creditLimit?: number | null;
  createdAt?: Date;
}) {
  return {
    _id: String(c._id),
    name: c.name,
    phone: c.phone ?? null,
    notes: c.notes ?? null,
    creditLimit: c.creditLimit ?? null,
    createdAt: c.createdAt?.toISOString?.() ?? null,
  };
}
