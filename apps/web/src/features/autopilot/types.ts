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

export type AutopilotDashboard = {
  generatedAt: string;
  emptyState: "none" | "learning";
  emptyMessage?: string;
  health: {
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
  alerts: AutopilotAlert[];
  highPriorityCount: number;
  whatChanged: {
    available: boolean;
    periodLabel: string;
    metrics: Array<{
      label: string;
      current: number;
      previous: number;
      changePct: number | null;
      formatted: string;
    }>;
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
