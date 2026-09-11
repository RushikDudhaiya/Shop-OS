import type { AutopilotAlert } from "./types";

export type AlertBucket = "critical" | "attention" | "opportunity";
export type AutopilotTab =
  | "overview"
  | "inventory"
  | "sales"
  | "customers"
  | "money"
  | "opportunities";

export type DisplayAlert = AutopilotAlert & {
  dismissKeys?: string[];
};

export function bucketAlerts(alerts: AutopilotAlert[]) {
  return {
    critical: alerts.filter(
      (a) => a.priority === "critical" || a.priority === "high",
    ).length,
    attention: alerts.filter((a) => a.priority === "medium").length,
    opportunity: alerts.filter((a) => a.priority === "low").length,
  };
}

export function alertBucket(priority: AutopilotAlert["priority"]): AlertBucket {
  if (priority === "critical" || priority === "high") return "critical";
  if (priority === "medium") return "attention";
  return "opportunity";
}

export function healthMessage(score: number) {
  if (score >= 90) return "Bahut Badhiya! Keep it up 🎉";
  if (score >= 75) return "Achha chal raha hai — keep going 👍";
  if (score >= 60) return "Thoda improve kar sakte ho";
  return "Dhyan dena padega — actions dekhein";
}

export function alertTabCategory(alert: AutopilotAlert): AutopilotTab {
  switch (alert.type) {
    case "STOCKOUT_RISK":
    case "REORDER":
    case "DEAD_STOCK":
      return "inventory";
    case "SALES_DROP":
      return "sales";
    case "OUTSTANDING":
      return "money";
    default:
      return alert.priority === "low" ? "opportunities" : "overview";
  }
}

export function normalizeAlertsForDisplay(
  alerts: AutopilotAlert[],
): DisplayAlert[] {
  const deadStock = alerts.filter((a) => a.type === "DEAD_STOCK");
  const rest = alerts.filter((a) => a.type !== "DEAD_STOCK");
  const result: DisplayAlert[] = rest.map((a) => ({ ...a, dismissKeys: [a.alertKey] }));

  if (deadStock.length === 1) {
    result.push({ ...deadStock[0]!, dismissKeys: [deadStock[0]!.alertKey] });
  } else if (deadStock.length > 1) {
    result.push({
      ...deadStock[0]!,
      id: "dead_stock:group",
      alertKey: "DEAD_STOCK:GROUP",
      title: `${deadStock.length} products have slow sales`,
      description: `${deadStock.length} items in stock with no sales in the last 28 days`,
      reason: "Sales are below your recent average for these products.",
      priority: "medium",
      actionLabel: "View Products",
      actionPath: "/inventory",
      confidenceLabel: "Review pricing / offers",
      dismissKeys: deadStock.map((a) => a.alertKey),
    });
  }

  const priorityRank: Record<AutopilotAlert["priority"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return result.sort(
    (a, b) =>
      priorityRank[b.priority] - priorityRank[a.priority] ||
      (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0),
  );
}

export function filterAlerts(
  alerts: DisplayAlert[],
  tab: AutopilotTab,
  bucket: "all" | AlertBucket,
): DisplayAlert[] {
  let filtered = alerts;

  if (tab === "opportunities") {
    filtered = filtered.filter((a) => alertBucket(a.priority) === "opportunity");
  } else if (tab !== "overview") {
    filtered = filtered.filter((a) => alertTabCategory(a) === tab);
  }

  if (bucket !== "all") {
    filtered = filtered.filter((a) => alertBucket(a.priority) === bucket);
  }

  return filtered;
}

export function sortAlerts(
  alerts: DisplayAlert[],
  sortBy: "priority" | "impact",
): DisplayAlert[] {
  const priorityRank: Record<AutopilotAlert["priority"], number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  return [...alerts].sort((a, b) => {
    if (sortBy === "impact") {
      return (
        (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0) ||
        priorityRank[b.priority] - priorityRank[a.priority]
      );
    }
    return (
      priorityRank[b.priority] - priorityRank[a.priority] ||
      (b.estimatedImpact ?? 0) - (a.estimatedImpact ?? 0)
    );
  });
}

export function actionButtonLabel(alert: AutopilotAlert) {
  if (alert.actionLabel === "Reorder") return "Reorder Now";
  return alert.actionLabel ?? "View";
}

export function expectedCustomersRange(
  weeklyCustomers: number | undefined,
): { min: number; max: number } | null {
  if (!weeklyCustomers || weeklyCustomers <= 0) return null;
  const avg = weeklyCustomers / 7;
  return {
    min: Math.max(0, Math.floor(avg * 0.85)),
    max: Math.max(1, Math.ceil(avg * 1.15)),
  };
}
