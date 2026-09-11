import { createExpenseSchema } from "@shop-os/shared";
import { Router } from "express";
import { Types } from "mongoose";
import { notFound } from "../../lib/errors.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireShopMember } from "../../middleware/require-shop-member.js";
import { roundMoney } from "../sales/sale.service.js";
import { ExpenseModel } from "./expense.model.js";

export const expensesRouter = Router({ mergeParams: true });

expensesRouter.get(
  "/",
  requireAuth,
  requireShopMember("expense.create"),
  async (req, res, next) => {
    try {
      const shopId = req.shopContext!.shopId;
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(
        50,
        Math.max(1, Number(req.query.pageSize) || 8),
      );
      const q =
        typeof req.query.q === "string" ? req.query.q.trim() : "";
      const category =
        typeof req.query.category === "string"
          ? req.query.category.trim()
          : "";

      const now = new Date();
      const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
      defaultFrom.setHours(0, 0, 0, 0);
      const defaultTo = new Date(now);
      defaultTo.setHours(23, 59, 59, 999);

      const parsed = parseRange(req.query.from, req.query.to);
      const from = parsed.from ?? defaultFrom;
      const to = parsed.to ?? defaultTo;

      const startOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 1,
        1,
      );
      const endOfLastMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );

      const filter: Record<string, unknown> = {
        shopId,
        spentAt: { $gte: from, $lte: to },
      };
      if (category) filter.category = category;
      if (q) {
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        filter.$or = [
          { note: { $regex: escaped, $options: "i" } },
          { category: { $regex: escaped, $options: "i" } },
        ];
      }

      const [items, totalCount, summaryAgg, byCategoryAgg, lastMonthAgg, highest] =
        await Promise.all([
          ExpenseModel.find(filter)
            .sort({ spentAt: -1 })
            .skip((page - 1) * pageSize)
            .limit(pageSize)
            .lean(),
          ExpenseModel.countDocuments(filter),
          ExpenseModel.aggregate<{
            total: number;
            count: number;
          }>([
            { $match: filter },
            {
              $group: {
                _id: null,
                total: { $sum: "$amount" },
                count: { $sum: 1 },
              },
            },
          ]),
          ExpenseModel.aggregate<{ _id: string; total: number }>([
            { $match: filter },
            { $group: { _id: "$category", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
          ]),
          ExpenseModel.aggregate<{ total: number }>([
            {
              $match: {
                shopId,
                spentAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
              },
            },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]),
          ExpenseModel.findOne(filter).sort({ amount: -1 }).lean(),
        ]);

      const total = roundMoney(summaryAgg[0]?.total ?? 0);
      const count = summaryAgg[0]?.count ?? 0;
      const msPerDay = 24 * 60 * 60 * 1000;
      const days = Math.max(
        1,
        Math.round((to.getTime() - from.getTime()) / msPerDay) + 1,
      );
      const avgDaily = count > 0 ? roundMoney(total / days) : 0;

      const lastMonthTotal = roundMoney(lastMonthAgg[0]?.total ?? 0);
      let vsLastMonthPct: number | null = null;
      if (lastMonthTotal > 0) {
        vsLastMonthPct = roundMoney(
          ((total - lastMonthTotal) / lastMonthTotal) * 100,
        );
      } else if (total > 0) {
        vsLastMonthPct = 100;
      }

      const byCategory = byCategoryAgg.map((row) => ({
        category: row._id,
        amount: roundMoney(row.total),
        pct: total > 0 ? roundMoney((row.total / total) * 100) : 0,
      }));

      res.json({
        range: { from: from.toISOString(), to: to.toISOString() },
        summary: {
          total,
          count,
          avgDaily,
          highestAmount: roundMoney(highest?.amount ?? 0),
          highestCategory: highest?.category ?? null,
          lastMonthTotal,
          vsLastMonthPct,
          days,
        },
        byCategory,
        items: items.map(serializeExpense),
        page,
        pageSize,
        totalCount,
        total,
      });
    } catch (err) {
      next(err);
    }
  },
);

expensesRouter.post(
  "/",
  requireAuth,
  requireShopMember("expense.create"),
  async (req, res, next) => {
    try {
      const body = createExpenseSchema.parse(req.body);
      const expense = await ExpenseModel.create({
        shopId: req.shopContext!.shopId,
        category: body.category,
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        note: body.note,
        spentAt: body.spentAt ?? new Date(),
        createdBy: req.user!._id,
      });
      res.status(201).json({ expense: serializeExpense(expense) });
    } catch (err) {
      next(err);
    }
  },
);

expensesRouter.delete(
  "/:expenseId",
  requireAuth,
  requireShopMember("expense.create"),
  async (req, res, next) => {
    try {
      if (!Types.ObjectId.isValid(req.params.expenseId)) {
        throw notFound("Expense not found");
      }
      const deleted = await ExpenseModel.findOneAndDelete({
        _id: req.params.expenseId,
        shopId: req.shopContext!.shopId,
      });
      if (!deleted) throw notFound("Expense not found");
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

function serializeExpense(e: {
  _id: { toString(): string };
  category: string;
  amount: number;
  paymentMethod: string;
  note?: string | null;
  spentAt: Date;
  createdAt?: Date;
}) {
  return {
    _id: String(e._id),
    category: e.category,
    amount: e.amount,
    paymentMethod: e.paymentMethod,
    note: e.note ?? null,
    spentAt: e.spentAt.toISOString(),
    createdAt: e.createdAt?.toISOString?.(),
  };
}

export function parseRange(
  fromRaw: unknown,
  toRaw: unknown,
): { from?: Date; to?: Date } {
  const from =
    typeof fromRaw === "string" && fromRaw
      ? new Date(fromRaw)
      : undefined;
  const to =
    typeof toRaw === "string" && toRaw ? new Date(toRaw) : undefined;
  if (from && Number.isNaN(from.getTime())) return {};
  if (to && Number.isNaN(to.getTime())) return {};
  if (to) {
    // inclusive end-of-day if date-only
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(toRaw))) {
      to.setHours(23, 59, 59, 999);
    }
  }
  return { from, to };
}
