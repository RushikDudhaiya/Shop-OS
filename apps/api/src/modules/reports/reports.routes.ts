import { Router } from "express";
import { Types } from "mongoose";
import { inferProductCategoryGroup } from "@shop-os/shared";
import { canViewCost } from "../../lib/privacy.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import { CustomerModel } from "../customers/customer.model.js";
import { parseRange } from "../expenses/expenses.routes.js";
import { ExpenseModel } from "../expenses/expense.model.js";
import { getAvailableStockMap } from "../inventory/stock.js";
import { PaymentModel } from "../payments/payment.model.js";
import { ProductCategoryModel } from "../products/category.model.js";
import { ProductModel } from "../products/product.model.js";
import { PurchaseModel } from "../purchases/purchase.models.js";
import { SaleItemModel } from "../sales/sale-item.model.js";
import { SaleModel } from "../sales/sale.model.js";
import { roundMoney } from "../sales/sale.service.js";

export const reportsRouter = Router({ mergeParams: true });

function rangeForPreset(preset: string): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);

  if (preset === "week") {
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
  } else if (preset === "month") {
    from.setDate(1);
    from.setHours(0, 0, 0, 0);
  } else {
    // today
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

reportsRouter.get(
  "/summary",
  requireAuth,
  requireShopMember(),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );
      const startOfYesterday = new Date(startOfDay);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const endOfLastMonth = new Date(startOfMonth.getTime() - 1);

      const [
        todayAgg,
        monthAgg,
        lastMonthAgg,
        udhaarAgg,
        udhaarCustomers,
        monthExpenses,
        todayExpenses,
        yesterdayExpenses,
        recentSales,
        products,
      ] = await Promise.all([
        SaleModel.aggregate<{ total: number; count: number }>([
          {
            $match: {
              shopId,
              status: "COMPLETED",
              completedAt: { $gte: startOfDay },
            },
          },
          {
            $group: {
              _id: null,
              total: { $sum: "$total" },
              count: { $sum: 1 },
            },
          },
        ]),
        SaleModel.aggregate<{ total: number }>([
          {
            $match: {
              shopId,
              status: "COMPLETED",
              completedAt: { $gte: startOfMonth },
            },
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]),
        SaleModel.aggregate<{ total: number }>([
          {
            $match: {
              shopId,
              status: "COMPLETED",
              completedAt: {
                $gte: startOfLastMonth,
                $lte: endOfLastMonth,
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]),
        SaleModel.aggregate<{ due: number }>([
          {
            $match: {
              shopId,
              status: "COMPLETED",
              amountDue: { $gt: 0 },
            },
          },
          { $group: { _id: null, due: { $sum: "$amountDue" } } },
        ]),
        SaleModel.aggregate<{ _id: Types.ObjectId | null }>([
          {
            $match: {
              shopId,
              status: "COMPLETED",
              amountDue: { $gt: 0 },
              customerId: { $ne: null },
            },
          },
          { $group: { _id: "$customerId" } },
        ]),
        ExpenseModel.aggregate<{ total: number }>([
          { $match: { shopId, spentAt: { $gte: startOfMonth } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        ExpenseModel.aggregate<{ total: number }>([
          { $match: { shopId, spentAt: { $gte: startOfDay } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        ExpenseModel.aggregate<{ total: number }>([
          {
            $match: {
              shopId,
              spentAt: { $gte: startOfYesterday, $lt: startOfDay },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
        SaleModel.find({
          shopId,
          status: "COMPLETED",
        })
          .sort({ completedAt: -1 })
          .limit(5)
          .populate("customerId", "name")
          .lean(),
        ProductModel.find({
          shopId,
          active: true,
          trackStock: true,
        })
          .select("_id minStock")
          .lean(),
      ]);

      const stockMap = await getAvailableStockMap(
        shopId,
        products.map((p) => p._id),
      );
      const lowStockCount = products.filter((p) => {
        const stock = stockMap.get(String(p._id)) ?? 0;
        return stock <= (p.minStock ?? 0);
      }).length;

      const monthSalesTotal = roundMoney(monthAgg[0]?.total ?? 0);
      const lastMonthSalesTotal = roundMoney(lastMonthAgg[0]?.total ?? 0);
      let monthSalesGrowthPct: number | null = null;
      if (lastMonthSalesTotal > 0) {
        monthSalesGrowthPct = roundMoney(
          ((monthSalesTotal - lastMonthSalesTotal) / lastMonthSalesTotal) * 100,
        );
      } else if (monthSalesTotal > 0) {
        monthSalesGrowthPct = 100;
      }

      const todayExpensesTotal = roundMoney(todayExpenses[0]?.total ?? 0);
      const yesterdayExpensesTotal = roundMoney(
        yesterdayExpenses[0]?.total ?? 0,
      );

      res.json({
        todaySalesTotal: roundMoney(todayAgg[0]?.total ?? 0),
        todaySalesCount: todayAgg[0]?.count ?? 0,
        monthSalesTotal,
        lastMonthSalesTotal,
        monthSalesGrowthPct,
        udhaarOutstanding: roundMoney(udhaarAgg[0]?.due ?? 0),
        udhaarCustomerCount: udhaarCustomers.length,
        lowStockCount,
        expensesTotal: roundMoney(monthExpenses[0]?.total ?? 0),
        todayExpensesTotal,
        yesterdayExpensesTotal,
        expensesDeltaVsYesterday: roundMoney(
          todayExpensesTotal - yesterdayExpensesTotal,
        ),
        recentBills: recentSales.map((sale) => {
          const customer = sale.customerId as
            | { name?: string }
            | Types.ObjectId
            | null
            | undefined;
          const customerName =
            customer &&
            typeof customer === "object" &&
            "name" in customer &&
            typeof customer.name === "string"
              ? customer.name
              : null;
          return {
            _id: String(sale._id),
            invoiceNumber: sale.invoiceNumber,
            customerName,
            total: roundMoney(sale.total),
            completedAt: sale.completedAt?.toISOString?.() ?? null,
          };
        }),
      });
    } catch (err) {
      next(err);
    }
  },
);

reportsRouter.get(
  "/sales",
  requireAuth,
  requireShopMember("report.view"),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const preset =
        typeof req.query.range === "string" ? req.query.range : "today";
      let from: Date | undefined;
      let to: Date | undefined;

      if (preset === "custom") {
        const custom = parseRange(req.query.from, req.query.to);
        from = custom.from;
        to = custom.to;
      } else {
        const r = rangeForPreset(preset);
        from = r.from;
        to = r.to;
      }

      if (!from || !to) {
        const r = rangeForPreset("today");
        from = r.from;
        to = r.to;
      }

      const saleMatch = {
        shopId,
        status: "COMPLETED" as const,
        completedAt: { $gte: from, $lte: to },
      };

      const sales = await SaleModel.find(saleMatch).lean();
      const saleIds = sales.map((s) => s._id);

      const [paymentSplit, topProducts, expenseAgg] = await Promise.all([
        PaymentModel.aggregate<{ _id: string; total: number }>([
          {
            $match: {
              shopId,
              status: "CONFIRMED",
              receivedAt: { $gte: from, $lte: to },
            },
          },
          { $group: { _id: "$method", total: { $sum: "$amount" } } },
        ]),
        SaleItemModel.aggregate<{
          _id: Types.ObjectId;
          name: string;
          qty: number;
          revenue: number;
        }>([
          { $match: { saleId: { $in: saleIds } } },
          {
            $group: {
              _id: "$productId",
              name: { $first: "$productNameSnapshot" },
              qty: { $sum: "$quantity" },
              revenue: { $sum: "$lineTotal" },
            },
          },
          { $sort: { qty: -1 } },
          { $limit: 10 },
        ]),
        ExpenseModel.aggregate<{ total: number }>([
          { $match: { shopId, spentAt: { $gte: from, $lte: to } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]),
      ]);

      const salesTotal = roundMoney(sales.reduce((s, x) => s + x.total, 0));
      const salesCount = sales.length;
      const udhaarInRange = roundMoney(
        sales.reduce((s, x) => s + x.amountDue, 0),
      );

      // Credit revenue = sales with unpaid portion still count in salesTotal
      const creditExtended = roundMoney(
        sales
          .filter((s) => s.amountDue > 0)
          .reduce((s, x) => s + x.amountDue, 0),
      );

      let estimatedProfit: number | null = null;
      let profitCoveragePct: number | null = null;

      const canViewCost =
        req.shopContext!.role === "OWNER" ||
        req.shopContext!.permissions.includes("cost.view");

      if (canViewCost && saleIds.length) {
        const lines = await SaleItemModel.find({
          saleId: { $in: saleIds },
        }).lean();
        let revenueWithCost = 0;
        let costSum = 0;
        let linesWithCost = 0;
        for (const line of lines) {
          if (
            line.unitCostSnapshot !== undefined &&
            line.unitCostSnapshot !== null
          ) {
            linesWithCost += 1;
            revenueWithCost += line.lineTotal;
            costSum += line.unitCostSnapshot * line.quantity;
          }
        }
        if (lines.length > 0) {
          profitCoveragePct = roundMoney((linesWithCost / lines.length) * 100);
        }
        if (linesWithCost > 0) {
          estimatedProfit = roundMoney(revenueWithCost - costSum);
        }
      }

      const paymentsByMethod: Record<string, number> = {};
      for (const row of paymentSplit) {
        paymentsByMethod[row._id] = roundMoney(row.total);
      }

      res.json({
        range: { from: from.toISOString(), to: to.toISOString(), preset },
        salesTotal,
        salesCount,
        paymentsByMethod,
        creditExtended,
        udhaarOutstandingInRange: udhaarInRange,
        expensesTotal: roundMoney(expenseAgg[0]?.total ?? 0),
        topProducts: topProducts.map((p) => ({
          productId: String(p._id),
          name: p.name,
          quantity: p.qty,
          revenue: roundMoney(p.revenue),
        })),
        estimatedProfit: canViewCost ? estimatedProfit : undefined,
        profitCoveragePct: canViewCost ? profitCoveragePct : undefined,
        profitLabel:
          canViewCost && estimatedProfit !== null
            ? profitCoveragePct !== null && profitCoveragePct < 100
              ? "Estimated profit"
              : "Profit"
            : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return roundMoney(((current - previous) / previous) * 100);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

function dayKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

reportsRouter.get(
  "/analytics",
  requireAuth,
  requireShopMember("report.view"),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const now = new Date();
      const defaultFrom = startOfDay(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6),
      );
      const defaultTo = endOfDay(now);
      const parsed = parseRange(req.query.from, req.query.to);
      const from = parsed.from ?? defaultFrom;
      const to = parsed.to ?? defaultTo;

      const rangeMs = Math.max(to.getTime() - from.getTime(), 24 * 60 * 60 * 1000);
      const prevTo = new Date(from.getTime() - 1);
      const prevFrom = new Date(prevTo.getTime() - rangeMs);

      const saleMatch = {
        shopId,
        status: "COMPLETED" as const,
        completedAt: { $gte: from, $lte: to },
      };
      const prevSaleMatch = {
        shopId,
        status: "COMPLETED" as const,
        completedAt: { $gte: prevFrom, $lte: prevTo },
      };

      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const weekStart = startOfDay(
        new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6),
      );

      const [
        currentSales,
        previousSales,
        todayAgg,
        weekAgg,
        draftPurchases,
        trackedProducts,
      ] = await Promise.all([
        SaleModel.find(saleMatch).lean(),
        SaleModel.find(prevSaleMatch).lean(),
        SaleModel.aggregate<{ total: number }>([
          {
            $match: {
              shopId,
              status: "COMPLETED",
              completedAt: { $gte: todayStart, $lte: todayEnd },
            },
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]),
        SaleModel.aggregate<{ total: number }>([
          {
            $match: {
              shopId,
              status: "COMPLETED",
              completedAt: { $gte: weekStart, $lte: todayEnd },
            },
          },
          { $group: { _id: null, total: { $sum: "$total" } } },
        ]),
        PurchaseModel.countDocuments({ shopId, status: "DRAFT" }),
        ProductModel.find({ shopId, active: true, trackStock: true })
          .select("_id name minStock imageUrl")
          .lean(),
      ]);

      const saleIds = currentSales.map((s) => s._id);

      const [currentItems, recentSales, itemCounts] =
        await Promise.all([
          saleIds.length
            ? SaleItemModel.find({ saleId: { $in: saleIds } }).lean()
            : Promise.resolve([]),
          SaleModel.find({ shopId, status: "COMPLETED" })
            .sort({ completedAt: -1 })
            .limit(5)
            .lean(),
          saleIds.length
            ? SaleItemModel.aggregate<{
                _id: Types.ObjectId;
                itemCount: number;
                itemsQty: number;
              }>([
                { $match: { saleId: { $in: saleIds } } },
                {
                  $group: {
                    _id: "$saleId",
                    itemCount: { $sum: 1 },
                    itemsQty: { $sum: "$quantity" },
                  },
                },
              ])
            : Promise.resolve([]),
        ]);

      const currentSalesTotal = roundMoney(
        currentSales.reduce((s, x) => s + x.total, 0),
      );
      const previousSalesTotal = roundMoney(
        previousSales.reduce((s, x) => s + x.total, 0),
      );
      const currentBills = currentSales.length;
      const previousBills = previousSales.length;
      const currentAvg =
        currentBills > 0 ? roundMoney(currentSalesTotal / currentBills) : 0;
      const previousAvg =
        previousBills > 0 ? roundMoney(previousSalesTotal / previousBills) : 0;

      const currentCustomers = new Set(
        currentSales
          .map((s) => (s.customerId ? String(s.customerId) : null))
          .filter(Boolean),
      ).size;
      const previousCustomers = new Set(
        previousSales
          .map((s) => (s.customerId ? String(s.customerId) : null))
          .filter(Boolean),
      ).size;

      const productIds = [
        ...new Set(
          currentItems
            .map((i) => (i.productId ? String(i.productId) : null))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const products = productIds.length
        ? await ProductModel.find({ _id: { $in: productIds }, shopId })
            .select("_id categoryId name imageUrl unit")
            .lean()
        : [];
      const categoryIds = [
        ...new Set(
          products
            .map((p) => (p.categoryId ? String(p.categoryId) : null))
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const categories = categoryIds.length
        ? await ProductCategoryModel.find({
            _id: { $in: categoryIds },
            shopId,
          })
            .select("_id name")
            .lean()
        : [];
      const categoryNameById = new Map(
        categories.map((c) => [String(c._id), c.name]),
      );
      const productMeta = new Map(
        products.map((p) => {
          const fromDb = p.categoryId
            ? categoryNameById.get(String(p.categoryId))
            : null;
          const categoryName =
            fromDb?.trim() ||
            inferProductCategoryGroup(p.name, p.unit ?? null);
          return [
            String(p._id),
            {
              categoryName,
              name: p.name,
              imageUrl: p.imageUrl ?? null,
            },
          ] as const;
        }),
      );

      const revenueByCategory = new Map<string, number>();
      for (const item of currentItems) {
        const meta = item.productId
          ? productMeta.get(String(item.productId))
          : null;
        const cat =
          meta?.categoryName ??
          inferProductCategoryGroup(item.productNameSnapshot ?? "", null);
        revenueByCategory.set(
          cat,
          (revenueByCategory.get(cat) ?? 0) + (item.lineTotal ?? 0),
        );
      }
      const categoryTotal = [...revenueByCategory.values()].reduce(
        (s, v) => s + v,
        0,
      );
      const byCategory = [...revenueByCategory.entries()]
        .map(([name, revenue]) => ({
          name,
          revenue: roundMoney(revenue),
          pct:
            categoryTotal > 0
              ? roundMoney((revenue / categoryTotal) * 100)
              : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6);

      const productAgg = new Map<
        string,
        { name: string; quantity: number; revenue: number; imageUrl: string | null }
      >();
      for (const item of currentItems) {
        const pid = item.productId ? String(item.productId) : item.productNameSnapshot;
        const meta = item.productId
          ? productMeta.get(String(item.productId))
          : null;
        const prev = productAgg.get(pid) ?? {
          name: item.productNameSnapshot,
          quantity: 0,
          revenue: 0,
          imageUrl: meta?.imageUrl ?? null,
        };
        prev.quantity += item.quantity;
        prev.revenue += item.lineTotal ?? 0;
        productAgg.set(pid, prev);
      }
      const topProducts = [...productAgg.entries()]
        .map(([productId, row]) => ({
          productId,
          name: row.name,
          quantity: roundMoney(row.quantity),
          revenue: roundMoney(row.revenue),
          imageUrl: row.imageUrl,
        }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);

      const dailyMap = new Map<string, { salesTotal: number; billsCount: number }>();
      for (
        let cursor = startOfDay(from);
        cursor.getTime() <= to.getTime();
        cursor = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          cursor.getDate() + 1,
        )
      ) {
        dailyMap.set(dayKey(cursor), { salesTotal: 0, billsCount: 0 });
      }
      for (const sale of currentSales) {
        if (!sale.completedAt) continue;
        const key = dayKey(new Date(sale.completedAt));
        const row = dailyMap.get(key);
        if (!row) continue;
        row.salesTotal += sale.total;
        row.billsCount += 1;
      }
      const daily = [...dailyMap.entries()].map(([date, row]) => ({
        date,
        label: new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "short",
        }).format(new Date(`${date}T12:00:00`)),
        salesTotal: roundMoney(row.salesTotal),
        billsCount: row.billsCount,
      }));

      const itemCountBySale = new Map(
        itemCounts.map((r) => [String(r._id), r.itemCount]),
      );
      // Prefer item counts for recent bills from a dedicated query
      const recentSaleIds = recentSales.map((s) => s._id);
      const recentItemCounts = recentSaleIds.length
        ? await SaleItemModel.aggregate<{ _id: Types.ObjectId; itemCount: number }>([
            { $match: { saleId: { $in: recentSaleIds } } },
            { $group: { _id: "$saleId", itemCount: { $sum: 1 } } },
          ])
        : [];
      const recentCountMap = new Map(
        recentItemCounts.map((r) => [String(r._id), r.itemCount]),
      );

      const stockMap = await getAvailableStockMap(
        shopId,
        trackedProducts.map((p) => p._id),
      );
      const stockStatus = trackedProducts
        .map((p) => {
          const stock = stockMap.get(String(p._id)) ?? 0;
          const minStock = p.minStock ?? 0;
          const status =
            stock <= 0 ? "out" : stock <= minStock ? "low" : "good";
          return {
            productId: String(p._id),
            name: p.name,
            stock,
            status,
            imageUrl: p.imageUrl ?? null,
          };
        })
        .sort((a, b) => {
          const rank = { out: 0, low: 1, good: 2 } as const;
          return rank[a.status as keyof typeof rank] - rank[b.status as keyof typeof rank] || a.stock - b.stock;
        })
        .slice(0, 5);

      const lowStockCount = trackedProducts.filter((p) => {
        const stock = stockMap.get(String(p._id)) ?? 0;
        return stock <= (p.minStock ?? 0);
      }).length;

      res.json({
        range: {
          from: from.toISOString(),
          to: to.toISOString(),
        },
        kpis: {
          salesTotal: currentSalesTotal,
          salesChangePct: pctChange(currentSalesTotal, previousSalesTotal),
          billsCount: currentBills,
          billsChangePct: pctChange(currentBills, previousBills),
          avgBill: currentAvg,
          avgBillChangePct: pctChange(currentAvg, previousAvg),
          customersCount: currentCustomers,
          customersChangePct: pctChange(currentCustomers, previousCustomers),
        },
        daily,
        byCategory,
        quickStats: {
          todaySales: roundMoney(todayAgg[0]?.total ?? 0),
          weekSales: roundMoney(weekAgg[0]?.total ?? 0),
          bestProduct: topProducts[0]
            ? { name: topProducts[0].name, productId: topProducts[0].productId }
            : null,
          lowStockCount,
          pendingPurchasesCount: draftPurchases,
        },
        topProducts,
        recentBills: recentSales.map((sale) => ({
          _id: String(sale._id),
          invoiceNumber: sale.invoiceNumber,
          itemCount:
            recentCountMap.get(String(sale._id)) ??
            itemCountBySale.get(String(sale._id)) ??
            0,
          total: roundMoney(sale.total),
          completedAt: sale.completedAt?.toISOString?.() ?? null,
        })),
        stockStatus,
      });
    } catch (err) {
      next(err);
    }
  },
);

const LOW_MARGIN_PCT = 15;
const TARGET_MARGIN_PCT = 20;
const DEFAULT_MONTHLY_PROFIT_GOAL = 15_000;

reportsRouter.get(
  "/profit-margin",
  requireAuth,
  requireShopMember("report.view"),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const allowCost = canViewCost(req);
      if (!allowCost) {
        res.status(403).json({
          code: "FORBIDDEN",
          message: "Cost / profit dekhne ki permission nahi hai",
        });
        return;
      }

      const preset =
        typeof req.query.range === "string" ? req.query.range : "today";
      let from: Date;
      let to: Date;
      if (preset === "custom") {
        const custom = parseRange(req.query.from, req.query.to);
        from = custom.from ?? rangeForPreset("today").from;
        to = custom.to ?? rangeForPreset("today").to;
      } else {
        const r = rangeForPreset(preset);
        from = r.from;
        to = r.to;
      }

      const now = new Date();
      const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      monthFrom.setHours(0, 0, 0, 0);
      const monthTo = new Date(now);
      monthTo.setHours(23, 59, 59, 999);

      const [rangeSales, monthSales, categories] = await Promise.all([
        SaleModel.find({
          shopId,
          status: "COMPLETED",
          completedAt: { $gte: from, $lte: to },
        })
          .select("_id")
          .lean(),
        SaleModel.find({
          shopId,
          status: "COMPLETED",
          completedAt: { $gte: monthFrom, $lte: monthTo },
        })
          .select("_id")
          .lean(),
        ProductCategoryModel.find({ shopId }).lean(),
      ]);

      const categoryNameById = new Map(
        categories.map((c) => [String(c._id), c.name]),
      );

      const rangeSaleIds = rangeSales.map((s) => s._id);
      const monthSaleIds = monthSales.map((s) => s._id);

      const [rangeLines, monthLines] = await Promise.all([
        rangeSaleIds.length
          ? SaleItemModel.find({ saleId: { $in: rangeSaleIds } }).lean()
          : Promise.resolve([]),
        monthSaleIds.length
          ? SaleItemModel.find({ saleId: { $in: monthSaleIds } }).lean()
          : Promise.resolve([]),
      ]);

      type Agg = {
        productId: string;
        name: string;
        revenue: number;
        cost: number;
        unitsSold: number;
        linesWithCost: number;
      };

      function aggregateLines(
        lines: Array<{
          productId: Types.ObjectId;
          productNameSnapshot: string;
          quantity: number;
          lineTotal: number;
          unitCostSnapshot?: number | null;
        }>,
      ) {
        const map = new Map<string, Agg>();
        let totalRevenue = 0;
        let totalCost = 0;
        let revenueWithCost = 0;

        for (const line of lines) {
          const id = String(line.productId);
          const existing = map.get(id) ?? {
            productId: id,
            name: line.productNameSnapshot,
            revenue: 0,
            cost: 0,
            unitsSold: 0,
            linesWithCost: 0,
          };
          existing.revenue += line.lineTotal;
          existing.unitsSold += line.quantity;
          existing.name = line.productNameSnapshot || existing.name;
          totalRevenue += line.lineTotal;

          if (
            line.unitCostSnapshot !== undefined &&
            line.unitCostSnapshot !== null
          ) {
            const lineCost = line.unitCostSnapshot * line.quantity;
            existing.cost += lineCost;
            existing.linesWithCost += 1;
            totalCost += lineCost;
            revenueWithCost += line.lineTotal;
          }
          map.set(id, existing);
        }

        return { map, totalRevenue, totalCost, revenueWithCost };
      }

      const rangeAgg = aggregateLines(rangeLines);
      const monthAgg = aggregateLines(monthLines);

      const productIds = [...rangeAgg.map.keys()].map(
        (id) => new Types.ObjectId(id),
      );
      const products = productIds.length
        ? await ProductModel.find({ shopId, _id: { $in: productIds } }).lean()
        : [];
      const productById = new Map(products.map((p) => [String(p._id), p]));
      const stockMap = productIds.length
        ? await getAvailableStockMap(shopId, productIds)
        : new Map<string, number>();

      const productRows = [...rangeAgg.map.values()]
        .map((row) => {
          const product = productById.get(row.productId);
          const name = product?.name ?? row.name;
          const category =
            (product?.categoryId
              ? categoryNameById.get(String(product.categoryId))
              : null) ||
            inferProductCategoryGroup(name, product?.unit);

          const avgCost =
            row.unitsSold > 0 && row.linesWithCost > 0
              ? row.cost / row.unitsSold
              : null;
          const purchase = product?.purchasePrice;
          const costPrice =
            purchase !== undefined && purchase !== null
              ? roundMoney(purchase)
              : avgCost !== null
                ? roundMoney(avgCost)
                : null;
          const currentSellingPrice = roundMoney(
            product?.sellingPrice ??
              (row.unitsSold > 0 ? row.revenue / row.unitsSold : 0),
          );
          const marginPerUnit =
            costPrice !== null
              ? roundMoney(currentSellingPrice - costPrice)
              : null;
          const marginPct =
            costPrice !== null && currentSellingPrice > 0
              ? roundMoney(
                  ((currentSellingPrice - costPrice) / currentSellingPrice) *
                    100,
                )
              : null;
          const totalProfit =
            row.linesWithCost > 0 ? roundMoney(row.revenue - row.cost) : null;

          const suggestedPrice =
            costPrice !== null && costPrice > 0
              ? roundMoney(costPrice / (1 - TARGET_MARGIN_PCT / 100))
              : null;

          return {
            productId: row.productId,
            name,
            category,
            imageUrl: product?.imageUrl ?? null,
            costPrice,
            sellingPrice: currentSellingPrice,
            currentSellingPrice,
            marginPerUnit,
            marginPct,
            unitsSold: roundMoney(row.unitsSold),
            totalProfit,
            stock: stockMap.get(row.productId) ?? null,
            suggestedPrice,
            suggestedMarginPct: TARGET_MARGIN_PCT,
          };
        })
        .sort((a, b) => (a.marginPct ?? 999) - (b.marginPct ?? 999));

      const totalRevenue = roundMoney(rangeAgg.totalRevenue);
      const totalCost = roundMoney(rangeAgg.totalCost);
      const totalProfit = roundMoney(
        rangeAgg.revenueWithCost - rangeAgg.totalCost,
      );
      const averageMarginPct =
        rangeAgg.revenueWithCost > 0
          ? roundMoney(
              ((rangeAgg.revenueWithCost - rangeAgg.totalCost) /
                rangeAgg.revenueWithCost) *
                100,
            )
          : null;

      const monthProfit = roundMoney(
        monthAgg.revenueWithCost - monthAgg.totalCost,
      );
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
      ).getDate();
      const projectedMonthEnd =
        dayOfMonth > 0
          ? roundMoney((monthProfit / dayOfMonth) * daysInMonth)
          : monthProfit;
      const monthlyGoalTarget = Math.max(
        DEFAULT_MONTHLY_PROFIT_GOAL,
        Math.ceil(monthProfit / 5000) * 5000 || DEFAULT_MONTHLY_PROFIT_GOAL,
      );

      const profitByCategoryMap = new Map<string, number>();
      for (const row of productRows) {
        if (row.totalProfit === null) continue;
        profitByCategoryMap.set(
          row.category,
          (profitByCategoryMap.get(row.category) ?? 0) + row.totalProfit,
        );
      }
      const categoryProfitSum = [...profitByCategoryMap.values()].reduce(
        (s, n) => s + n,
        0,
      );
      const byCategory = [...profitByCategoryMap.entries()]
        .map(([name, profit]) => ({
          name,
          profit: roundMoney(profit),
          pct:
            categoryProfitSum > 0
              ? roundMoney((profit / categoryProfitSum) * 100)
              : 0,
        }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 6);

      const topProfitMakers = [...productRows]
        .filter((p) => p.totalProfit !== null && p.totalProfit > 0)
        .sort((a, b) => (b.totalProfit ?? 0) - (a.totalProfit ?? 0))
        .slice(0, 5)
        .map((p) => ({
          productId: p.productId,
          name: p.name,
          marginPct: p.marginPct,
          totalProfit: p.totalProfit,
          imageUrl: p.imageUrl,
        }));

      const alerts = productRows
        .filter(
          (p) =>
            p.marginPct !== null &&
            p.marginPct < LOW_MARGIN_PCT &&
            p.suggestedPrice !== null &&
            p.costPrice !== null,
        )
        .slice(0, 5)
        .map((p) => ({
          productId: p.productId,
          name: p.name,
          marginPct: p.marginPct!,
          costPrice: p.costPrice!,
          sellingPrice: p.currentSellingPrice,
          suggestedPrice: p.suggestedPrice!,
          suggestedMarginPct: TARGET_MARGIN_PCT,
          imageUrl: p.imageUrl,
        }));

      res.json({
        range: {
          from: from.toISOString(),
          to: to.toISOString(),
          preset,
        },
        kpis: {
          totalRevenue,
          totalCost,
          totalProfit,
          averageMarginPct,
        },
        monthlyGoal: {
          current: monthProfit,
          target: monthlyGoalTarget,
          projectedMonthEnd,
        },
        byCategory,
        topProfitMakers,
        alerts,
        products: productRows,
      });
    } catch (err) {
      next(err);
    }
  },
);
