import { Types } from "mongoose";
import { CustomerModel } from "../customers/customer.model.js";
import { getAvailableStockMap } from "../inventory/stock.js";
import { ProductModel } from "../products/product.model.js";
import { SaleItemModel } from "../sales/sale-item.model.js";
import { SaleModel } from "../sales/sale.model.js";
import { roundMoney } from "../sales/sale.service.js";
import { ShopAlertModel } from "./shop-alert.model.js";

const ANALYSIS_DAYS = 28;
const COVERAGE_DAYS = 7;

export type AutopilotAlert = {
  id: string;
  alertKey: string;
  type: string;
  priority: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  reason?: string;
  entityType?: string;
  entityId?: string;
  actionType?: string;
  actionLabel?: string;
  actionPath?: string;
  estimatedImpact?: number;
  confidenceLabel?: string;
  createdAt: string;
};

export type AutopilotHealth = {
  available: boolean;
  score: number | null;
  components: {
    sales: number | null;
    inventory: number | null;
    customers: number | null;
    cash: number | null;
    profit: number | null;
  };
  reasons: Array<{ label: string; delta: number }>;
  message?: string;
};

export type AutopilotChangeMetric = {
  label: string;
  current: number;
  previous: number;
  changePct: number | null;
  formatted: string;
};

export type AutopilotDashboard = {
  generatedAt: string;
  emptyState: "none" | "learning";
  emptyMessage?: string;
  health: AutopilotHealth;
  alerts: AutopilotAlert[];
  highPriorityCount: number;
  whatChanged: {
    available: boolean;
    periodLabel: string;
    metrics: AutopilotChangeMetric[];
    highlights: Array<{ label: string; changePct: number; direction: "up" | "down" }>;
    watch: Array<{ label: string; changePct: number; direction: "up" | "down" }>;
  };
  tomorrow: {
    available: boolean;
    message?: string;
    expectedSalesMin?: number;
    expectedSalesMax?: number;
    stockoutProducts?: Array<{ productId: string; name: string }>;
  };
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  const d = startOfDay(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysAgoStart(days: number, from = new Date()) {
  const d = startOfDay(from);
  d.setDate(d.getDate() - days);
  return d;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0 && current <= 0) return 0;
  if (previous <= 0) return 100;
  return roundMoney(((current - previous) / previous) * 100);
}

function formatChangePct(pct: number | null) {
  if (pct === null) return "—";
  if (pct === 0) return "0%";
  const arrow = pct > 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(pct)}%`;
}

function confidenceLabel(confidence: number) {
  if (confidence >= 0.75) return "High confidence";
  if (confidence >= 0.45) return "Based on recent sales";
  return "Limited data";
}

function scoreFromGrowth(growthPct: number | null) {
  if (growthPct === null) return 70;
  if (growthPct >= 20) return 95;
  if (growthPct >= 10) return 88;
  if (growthPct >= 0) return 80;
  if (growthPct >= -10) return 68;
  if (growthPct >= -20) return 55;
  return 42;
}

export async function buildAutopilotDashboard(
  shopId: Types.ObjectId,
): Promise<AutopilotDashboard> {
  const now = new Date();
  const currentStart = daysAgoStart(6, now);
  const currentEnd = endOfDay(now);
  const previousStart = daysAgoStart(13, now);
  const previousEnd = new Date(currentStart.getTime() - 1);
  const analysisStart = daysAgoStart(ANALYSIS_DAYS - 1, now);

  const completedMatch = {
    shopId,
    status: "COMPLETED" as const,
    completedAt: { $gte: analysisStart, $lte: currentEnd },
  };

  const [
    salesHistoryCount,
    currentSales,
    previousSales,
    currentCustomers,
    previousCustomers,
    udhaarAgg,
    oldUdhaarAgg,
    products,
    velocityRows,
    recentProductSales,
    dismissedAlerts,
  ] = await Promise.all([
    SaleModel.countDocuments({
      shopId,
      status: "COMPLETED",
      completedAt: { $ne: null },
    }),
    SaleModel.aggregate<{ total: number; count: number }>([
      {
        $match: {
          shopId,
          status: "COMPLETED",
          completedAt: { $gte: currentStart, $lte: currentEnd },
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
    SaleModel.aggregate<{ total: number; count: number }>([
      {
        $match: {
          shopId,
          status: "COMPLETED",
          completedAt: { $gte: previousStart, $lte: previousEnd },
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
    SaleModel.aggregate<{ count: number }>([
      {
        $match: {
          shopId,
          status: "COMPLETED",
          completedAt: { $gte: currentStart, $lte: currentEnd },
          customerId: { $ne: null },
        },
      },
      { $group: { _id: "$customerId" } },
      { $count: "count" },
    ]),
    SaleModel.aggregate<{ count: number }>([
      {
        $match: {
          shopId,
          status: "COMPLETED",
          completedAt: { $gte: previousStart, $lte: previousEnd },
          customerId: { $ne: null },
        },
      },
      { $group: { _id: "$customerId" } },
      { $count: "count" },
    ]),
    SaleModel.aggregate<{ due: number; count: number }>([
      {
        $match: {
          shopId,
          status: "COMPLETED",
          amountDue: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          due: { $sum: "$amountDue" },
          count: { $sum: 1 },
        },
      },
    ]),
    SaleModel.aggregate<{ due: number; count: number }>([
      {
        $match: {
          shopId,
          status: "COMPLETED",
          amountDue: { $gt: 0 },
          completedAt: { $lte: daysAgoStart(7, now) },
        },
      },
      {
        $group: {
          _id: null,
          due: { $sum: "$amountDue" },
          count: { $sum: 1 },
        },
      },
    ]),
    ProductModel.find({ shopId, active: true, trackStock: true })
      .select("_id name minStock sellingPrice")
      .lean(),
    SaleItemModel.aggregate<{
      _id: Types.ObjectId;
      name: string;
      qty: number;
      days: number;
    }>([
      {
        $lookup: {
          from: "sales",
          localField: "saleId",
          foreignField: "_id",
          as: "sale",
        },
      },
      { $unwind: "$sale" },
      {
        $match: {
          "sale.shopId": shopId,
          "sale.status": "COMPLETED",
          "sale.completedAt": { $gte: analysisStart, $lte: currentEnd },
        },
      },
      {
        $group: {
          _id: "$productId",
          name: { $first: "$productNameSnapshot" },
          qty: { $sum: "$quantity" },
          days: { $addToSet: { $dateToString: { format: "%Y-%m-%d", date: "$sale.completedAt" } } },
        },
      },
      {
        $project: {
          name: 1,
          qty: 1,
          days: { $size: "$days" },
        },
      },
    ]),
    SaleItemModel.aggregate<{
      _id: Types.ObjectId;
      name: string;
      currentQty: number;
      previousQty: number;
    }>([
      {
        $lookup: {
          from: "sales",
          localField: "saleId",
          foreignField: "_id",
          as: "sale",
        },
      },
      { $unwind: "$sale" },
      {
        $match: {
          "sale.shopId": shopId,
          "sale.status": "COMPLETED",
          "sale.completedAt": { $gte: previousStart, $lte: currentEnd },
        },
      },
      {
        $group: {
          _id: "$productId",
          name: { $first: "$productNameSnapshot" },
          currentQty: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$sale.completedAt", currentStart] },
                    { $lte: ["$sale.completedAt", currentEnd] },
                  ],
                },
                "$quantity",
                0,
              ],
            },
          },
          previousQty: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ["$sale.completedAt", previousStart] },
                    { $lte: ["$sale.completedAt", previousEnd] },
                  ],
                },
                "$quantity",
                0,
              ],
            },
          },
        },
      },
    ]),
    ShopAlertModel.find({
      shopId,
      status: { $in: ["dismissed", "snoozed"] },
    }).lean(),
  ]);

  const stockMap = await getAvailableStockMap(
    shopId,
    products.map((p) => p._id),
  );

  const velocityByProduct = new Map(
    velocityRows.map((row) => [
      String(row._id),
      {
        name: row.name,
        qty: row.qty,
        activeDays: Math.max(1, row.days),
      },
    ]),
  );

  const currentSalesTotal = roundMoney(currentSales[0]?.total ?? 0);
  const previousSalesTotal = roundMoney(previousSales[0]?.total ?? 0);
  const currentSalesCount = currentSales[0]?.count ?? 0;
  const previousSalesCount = previousSales[0]?.count ?? 0;
  const currentCustomerCount = currentCustomers[0]?.count ?? 0;
  const previousCustomerCount = previousCustomers[0]?.count ?? 0;
  const currentAvgBill =
    currentSalesCount > 0
      ? roundMoney(currentSalesTotal / currentSalesCount)
      : 0;
  const previousAvgBill =
    previousSalesCount > 0
      ? roundMoney(previousSalesTotal / previousSalesCount)
      : 0;

  const salesChangePct = pctChange(currentSalesTotal, previousSalesTotal);
  const customerChangePct = pctChange(
    currentCustomerCount,
    previousCustomerCount,
  );
  const avgBillChangePct = pctChange(currentAvgBill, previousAvgBill);

  const udhaarTotal = roundMoney(udhaarAgg[0]?.due ?? 0);
  const oldUdhaarTotal = roundMoney(oldUdhaarAgg[0]?.due ?? 0);
  const oldUdhaarCount = oldUdhaarAgg[0]?.count ?? 0;

  const dismissedKeys = new Set(
    dismissedAlerts
      .filter((a) => {
        if (a.status === "snoozed" && a.snoozedUntil) {
          return new Date(a.snoozedUntil) > now;
        }
        return a.status === "dismissed";
      })
      .map((a) => a.alertKey),
  );

  const candidateAlerts: AutopilotAlert[] = [];

  for (const product of products) {
    const pid = String(product._id);
    const stock = stockMap.get(pid) ?? 0;
    const minStock = product.minStock ?? 0;
    const velocity = velocityByProduct.get(pid);
    const dailyAvg = velocity ? velocity.qty / velocity.activeDays : 0;

    if (stock <= 0) {
      candidateAlerts.push({
        id: `out_of_stock:${pid}`,
        alertKey: `OUT_OF_STOCK:${pid}`,
        type: "STOCKOUT_RISK",
        priority: "critical",
        title: `${product.name} is out of stock`,
        description: `Current stock: 0. Restock to avoid missed sales.`,
        reason: "Product has zero available stock.",
        entityType: "product",
        entityId: pid,
        actionType: "CREATE_PURCHASE",
        actionLabel: "Create Purchase",
        actionPath: `/purchases?productId=${pid}`,
        estimatedImpact: roundMoney((product.sellingPrice ?? 0) * Math.max(dailyAvg, 1) * 3),
        confidenceLabel: velocity ? confidenceLabel(0.8) : "Limited data",
        createdAt: now.toISOString(),
      });
      continue;
    }

    if (dailyAvg > 0) {
      const daysLeft = stock / dailyAvg;
      if (daysLeft <= 3) {
        const recommended = Math.max(
          1,
          Math.ceil(dailyAvg * COVERAGE_DAYS) - stock,
        );
        candidateAlerts.push({
          id: `stockout:${pid}`,
          alertKey: `STOCKOUT_RISK:${pid}`,
          type: "STOCKOUT_RISK",
          priority: daysLeft <= 1 ? "critical" : "high",
          title: `${product.name} may run out ${daysLeft <= 1 ? "today" : `in ~${Math.ceil(daysLeft)} days`}`,
          description: `Stock: ${stock} · Daily sales: ${Math.max(0.1, roundMoney(dailyAvg * 10) / 10)} units/day · Recommended: ${recommended} units`,
          reason: `At current pace, stock may finish in about ${Math.max(1, Math.ceil(daysLeft))} day(s).`,
          entityType: "product",
          entityId: pid,
          actionType: "CREATE_PURCHASE",
          actionLabel: "Reorder",
          actionPath: `/purchases?productId=${pid}&qty=${recommended}`,
          estimatedImpact: roundMoney((product.sellingPrice ?? 0) * recommended),
          confidenceLabel: confidenceLabel(Math.min(0.95, 0.5 + velocity!.activeDays / 14)),
          createdAt: now.toISOString(),
        });
      }
    } else if (stock <= minStock) {
      candidateAlerts.push({
        id: `reorder:${pid}`,
        alertKey: `REORDER:${pid}`,
        type: "REORDER",
        priority: "medium",
        title: `${product.name} is below minimum stock`,
        description: `Stock: ${stock} · Minimum: ${minStock}`,
        reason: "Inventory is at or below the minimum level you set.",
        entityType: "product",
        entityId: pid,
        actionType: "CREATE_PURCHASE",
        actionLabel: "Reorder",
        actionPath: `/purchases?productId=${pid}`,
        confidenceLabel: "Based on stock settings",
        createdAt: now.toISOString(),
      });
    }

    if (stock > 0 && (!velocity || velocity.qty === 0)) {
      candidateAlerts.push({
        id: `dead_stock:${pid}`,
        alertKey: `DEAD_STOCK:${pid}`,
        type: "DEAD_STOCK",
        priority: "low",
        title: `${product.name} is slow-moving`,
        description: `Stock: ${stock} · No sales in last ${ANALYSIS_DAYS} days`,
        reason: "Product has inventory but no recent completed sales.",
        entityType: "product",
        entityId: pid,
        actionType: "VIEW_INVENTORY",
        actionLabel: "View Product",
        actionPath: `/inventory`,
        confidenceLabel: "Based on recent sales",
        createdAt: now.toISOString(),
      });
    }
  }

  if (oldUdhaarTotal > 0) {
    candidateAlerts.push({
      id: "outstanding:shop",
      alertKey: "OUTSTANDING:SHOP",
      type: "OUTSTANDING",
      priority: oldUdhaarTotal >= 5000 ? "high" : "medium",
      title: `${formatINR(oldUdhaarTotal)} outstanding for 7+ days`,
      description: `${oldUdhaarCount} bill(s) pending collection`,
      reason: "Some completed bills still have amount due after 7 days.",
      entityType: "shop",
      actionType: "VIEW_OUTSTANDING",
      actionLabel: "View Outstanding",
      actionPath: "/customers",
      estimatedImpact: oldUdhaarTotal,
      confidenceLabel: "High confidence",
      createdAt: now.toISOString(),
    });
  }

  if (
    salesHistoryCount >= 7 &&
    previousSalesTotal > 0 &&
    salesChangePct !== null &&
    salesChangePct <= -15
  ) {
    candidateAlerts.push({
      id: "sales_drop:shop",
      alertKey: "SALES_DROP:SHOP",
      type: "SALES_DROP",
      priority: "medium",
      title: `Sales down ${Math.abs(salesChangePct)}% this week`,
      description: `Last 7 days: ${formatINR(currentSalesTotal)} vs previous: ${formatINR(previousSalesTotal)}`,
      reason: "Weekly sales dropped compared with the previous 7-day period.",
      entityType: "shop",
      actionType: "VIEW_REPORTS",
      actionLabel: "View Reports",
      actionPath: "/reports",
      confidenceLabel: "Based on recent sales",
      createdAt: now.toISOString(),
    });
  }

  const priorityRank: Record<AutopilotAlert["priority"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  const alerts = candidateAlerts
    .filter((a) => !dismissedKeys.has(a.alertKey))
    .sort((a, b) => {
      const pr =
        priorityRank[b.priority] - priorityRank[a.priority] ||
        (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0);
      return pr;
    })
    .slice(0, 8);

  const highPriorityCount = alerts.filter(
    (a) => a.priority === "high" || a.priority === "critical",
  ).length;

  const trackedCount = products.length;
  const healthyStock = products.filter((p) => {
    const stock = stockMap.get(String(p._id)) ?? 0;
    return stock > (p.minStock ?? 0);
  }).length;
  const inventoryScore =
    trackedCount > 0 ? clamp(Math.round((healthyStock / trackedCount) * 100), 0, 100) : null;

  const salesScore = scoreFromGrowth(salesChangePct);
  const customerScore = scoreFromGrowth(customerChangePct);
  const cashScore =
    currentSalesTotal > 0
      ? clamp(
          Math.round(100 - (udhaarTotal / Math.max(currentSalesTotal * 4, 1)) * 100),
          0,
          100,
        )
      : udhaarTotal > 0
        ? 50
        : 90;

  const hasEnoughData = salesHistoryCount >= 5;
  const healthComponents = {
    sales: hasEnoughData ? salesScore : null,
    inventory: inventoryScore,
    customers: hasEnoughData ? customerScore : null,
    cash: hasEnoughData ? cashScore : null,
    profit: null as number | null,
  };

  const weights = [
    { key: "sales" as const, weight: 0.25, value: healthComponents.sales },
    { key: "inventory" as const, weight: 0.25, value: healthComponents.inventory },
    { key: "customers" as const, weight: 0.15, value: healthComponents.customers },
    { key: "cash" as const, weight: 0.15, value: healthComponents.cash },
  ].filter((w) => w.value !== null);

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);
  const healthScore =
    hasEnoughData && totalWeight > 0
      ? Math.round(
          weights.reduce((s, w) => s + (w.value ?? 0) * (w.weight / totalWeight), 0),
        )
      : null;

  const healthReasons: Array<{ label: string; delta: number }> = [];
  if (salesChangePct !== null && salesChangePct !== 0) {
    healthReasons.push({
      label: salesChangePct > 0 ? "Sales increased" : "Sales decreased",
      delta: salesChangePct > 0 ? 8 : -8,
    });
  }
  if (customerChangePct !== null && customerChangePct !== 0) {
    healthReasons.push({
      label: customerChangePct > 0 ? "Customers increased" : "Customers decreased",
      delta: customerChangePct > 0 ? 5 : -5,
    });
  }
  if (oldUdhaarTotal > 0) {
    healthReasons.push({ label: "Outstanding needs attention", delta: -6 });
  }
  if (alerts.some((a) => a.type === "DEAD_STOCK")) {
    healthReasons.push({ label: "Slow-moving stock detected", delta: -4 });
  }

  const productChanges = recentProductSales
    .map((row) => {
      const change = pctChange(row.currentQty, row.previousQty);
      return {
        name: row.name,
        changePct: change ?? 0,
        previousQty: row.previousQty,
        currentQty: row.currentQty,
      };
    })
    .filter((r) => r.previousQty > 0 || r.currentQty > 0)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));

  const highlights = productChanges
    .filter((r) => r.changePct >= 15)
    .slice(0, 2)
    .map((r) => ({
      label: `${r.name} sales`,
      changePct: r.changePct,
      direction: "up" as const,
    }));

  const watch = productChanges
    .filter((r) => r.changePct <= -15)
    .slice(0, 2)
    .map((r) => ({
      label: `${r.name} sales`,
      changePct: Math.abs(r.changePct),
      direction: "down" as const,
    }));

  const avgDailySales =
    currentSalesCount > 0 ? currentSalesTotal / 7 : previousSalesTotal / 7;
  const tomorrowAvailable = salesHistoryCount >= 7 && avgDailySales > 0;
  const tomorrowMin = tomorrowAvailable
    ? roundMoney(avgDailySales * 0.85)
    : undefined;
  const tomorrowMax = tomorrowAvailable
    ? roundMoney(avgDailySales * 1.15)
    : undefined;

  const stockoutProducts = alerts
    .filter((a) => a.type === "STOCKOUT_RISK" && a.entityId)
    .slice(0, 5)
    .map((a) => ({
      productId: a.entityId!,
      name: a.title.split(" may")[0]?.split(" is")[0] ?? a.title,
    }));

  return {
    generatedAt: now.toISOString(),
    emptyState: salesHistoryCount === 0 ? "learning" : "none",
    emptyMessage:
      salesHistoryCount === 0
        ? "Complete a few bills to unlock sales insights, reorder predictions, and shop health."
        : undefined,
    health: {
      available: hasEnoughData,
      score: healthScore,
      components: healthComponents,
      reasons: healthReasons.slice(0, 4),
      message: hasEnoughData
        ? undefined
        : "Collecting enough data… Keep using Shop OS to unlock your shop health score.",
    },
    alerts,
    highPriorityCount,
    whatChanged: {
      available: salesHistoryCount >= 3,
      periodLabel: "Last 7 days vs previous 7 days",
      metrics: [
        {
          label: "Sales",
          current: currentSalesTotal,
          previous: previousSalesTotal,
          changePct: salesChangePct,
          formatted: formatChangePct(salesChangePct),
        },
        {
          label: "Customers",
          current: currentCustomerCount,
          previous: previousCustomerCount,
          changePct: customerChangePct,
          formatted: formatChangePct(customerChangePct),
        },
        {
          label: "Avg Bill",
          current: currentAvgBill,
          previous: previousAvgBill,
          changePct: avgBillChangePct,
          formatted: formatChangePct(avgBillChangePct),
        },
      ],
      highlights,
      watch,
    },
    tomorrow: {
      available: tomorrowAvailable,
      message: tomorrowAvailable
        ? undefined
        : "We need more sales history to make a reliable tomorrow forecast.",
      expectedSalesMin: tomorrowMin,
      expectedSalesMax: tomorrowMax,
      stockoutProducts,
    },
  };
}

function formatINR(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export async function dismissAutopilotAlert(
  shopId: Types.ObjectId,
  alertKey: string,
) {
  await ShopAlertModel.findOneAndUpdate(
    { shopId, alertKey },
    {
      shopId,
      alertKey,
      type: alertKey.split(":")[0] ?? "UNKNOWN",
      priority: "medium",
      title: alertKey,
      description: "Dismissed by user",
      status: "dismissed",
      dismissedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

export async function snoozeAutopilotAlert(
  shopId: Types.ObjectId,
  alertKey: string,
  hours = 24,
) {
  const until = new Date(Date.now() + hours * 60 * 60 * 1000);
  await ShopAlertModel.findOneAndUpdate(
    { shopId, alertKey },
    {
      shopId,
      alertKey,
      type: alertKey.split(":")[0] ?? "UNKNOWN",
      priority: "medium",
      title: alertKey,
      description: "Snoozed by user",
      status: "snoozed",
      snoozedUntil: until,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return until.toISOString();
}
