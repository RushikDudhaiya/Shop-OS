import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronRight, Sparkles } from "lucide-react";
import { Surface } from "@/components/ui";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import {
  bucketAlerts,
  healthMessage,
} from "./autopilot-utils";
import type { AutopilotDashboard } from "./types";

export function ShopAutopilotSection({ shopId }: { shopId: string }) {
  const [data, setData] = useState<AutopilotDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<AutopilotDashboard>(
        `/api/shops/${shopId}/autopilot`,
      );
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  const buckets = useMemo(
    () => bucketAlerts(data?.alerts ?? []),
    [data?.alerts],
  );
  const totalPriorities = data?.alerts.length ?? 0;

  if (loading) {
    return (
      <Surface className="animate-pulse space-y-4 p-5">
        <div className="h-5 w-48 rounded bg-paper-2" />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="h-20 rounded-xl bg-paper-2" />
          <div className="h-20 rounded-xl bg-paper-2" />
          <div className="h-20 rounded-xl bg-paper-2" />
        </div>
        <div className="h-28 rounded-xl bg-paper-2" />
      </Surface>
    );
  }

  if (!data) return null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
          <Bot className="size-4" />
        </span>
        <h2 className="min-w-0 flex-1 text-base font-semibold text-ink">
          Shop Autopilot
          {totalPriorities > 0 ? (
            <span className="font-normal text-ink-muted">
              {" "}
              ({totalPriorities} priorit{totalPriorities === 1 ? "y" : "ies"})
            </span>
          ) : null}
        </h2>
        <Link
          to="/autopilot"
          className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-forest hover:underline"
        >
          View All
          <ChevronRight className="size-4" />
        </Link>
      </div>

      {data.emptyState === "learning" ? (
        <Surface className="border-dashed border-forest/20 bg-forest/[0.03] p-5">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 size-5 shrink-0 text-forest" />
            <div>
              <p className="font-medium text-ink">Shop Autopilot is learning</p>
              <p className="mt-1 text-sm text-ink-muted">{data.emptyMessage}</p>
            </div>
          </div>
        </Surface>
      ) : null}

      <Surface className="grid gap-0 divide-y divide-line/70 p-0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <PrioritySummaryCard
          count={buckets.critical}
          label="Critical"
          sublabel="Turant Action"
          tone="critical"
        />
        <PrioritySummaryCard
          count={buckets.attention}
          label="Attention"
          sublabel="Jald Dhyan De"
          tone="attention"
        />
        <PrioritySummaryCard
          count={buckets.opportunity}
          label="Opportunity"
          sublabel="Aapke Liye Mauka"
          tone="opportunity"
        />
      </Surface>

      <Surface className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink-muted">Shop Health</p>
          {data.health.available && data.health.score !== null ? (
            <>
              <p className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                {data.health.score}
                <span className="text-xl text-ink-muted">/100</span>
              </p>
              <p className="text-sm text-ink-muted">
                {healthMessage(data.health.score)}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                <div
                  className="h-full rounded-full bg-forest transition-all"
                  style={{ width: `${data.health.score}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">{data.health.message}</p>
          )}
        </div>

        {data.health.available ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {data.health.components.sales !== null ? (
              <HealthMetric label="Sales" value={data.health.components.sales} />
            ) : null}
            {data.health.components.inventory !== null ? (
              <HealthMetric
                label="Inventory"
                value={data.health.components.inventory}
              />
            ) : null}
            {data.health.components.customers !== null ? (
              <HealthMetric
                label="Customers"
                value={data.health.components.customers}
              />
            ) : null}
            {data.health.components.cash !== null ? (
              <HealthMetric label="Cash" value={data.health.components.cash} />
            ) : null}
          </div>
        ) : null}
      </Surface>
    </section>
  );
}

function PrioritySummaryCard({
  count,
  label,
  sublabel,
  tone,
}: {
  count: number;
  label: string;
  sublabel: string;
  tone: "critical" | "attention" | "opportunity";
}) {
  const toneClass =
    tone === "critical"
      ? "text-danger"
      : tone === "attention"
        ? "text-orange-600"
        : "text-success";

  return (
    <div className="px-5 py-4 text-center">
      <p className={cn("font-display text-3xl font-semibold", toneClass)}>
        {count}
      </p>
      <p className={cn("mt-1 text-sm font-semibold", toneClass)}>{label}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{sublabel}</p>
    </div>
  );
}

function HealthMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line/70 bg-paper-2/30 px-3 py-2.5 text-center">
      <p className="text-[11px] font-medium text-ink-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">
        {value}
        <span className="text-xs font-normal text-ink-muted">/100</span>
      </p>
    </div>
  );
}
