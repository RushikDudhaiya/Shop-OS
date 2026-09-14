import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronDown,
  Info,
  Sparkles,
  X,
} from "lucide-react";
import { AppPageHeader, PageLoader, Surface } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";
import {
  actionButtonLabel,
  alertBucket,
  bucketAlerts,
  expectedCustomersRange,
  filterAlerts,
  healthMessage,
  normalizeAlertsForDisplay,
  sortAlerts,
  type AlertBucket,
  type AutopilotTab,
  type DisplayAlert,
} from "./autopilot-utils";
import type { AutopilotDashboard } from "./types";

const TABS: { id: AutopilotTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "inventory", label: "Inventory" },
  { id: "sales", label: "Sales" },
  { id: "customers", label: "Customers" },
  { id: "money", label: "Money" },
  { id: "opportunities", label: "Opportunities" },
];

function bucketDotClass(bucket: AlertBucket) {
  if (bucket === "critical") return "bg-danger";
  if (bucket === "attention") return "bg-orange-500";
  return "bg-success";
}

export function AutopilotPage() {
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const [data, setData] = useState<AutopilotDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<AutopilotTab>("overview");
  const [priorityFilter, setPriorityFilter] = useState<"all" | AlertBucket>("all");
  const [sortBy, setSortBy] = useState<"priority" | "impact">("priority");
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
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

  async function dismissAlert(alert: DisplayAlert) {
    if (!shopId) return;
    const keys = alert.dismissKeys ?? [alert.alertKey];
    for (const key of keys) {
      await api(
        `/api/shops/${shopId}/autopilot/alerts/${encodeURIComponent(key)}/dismiss`,
        { method: "POST" },
      );
    }
    await load();
  }

  const displayAlerts = useMemo(
    () => normalizeAlertsForDisplay(data?.alerts ?? []),
    [data?.alerts],
  );

  const buckets = useMemo(() => bucketAlerts(data?.alerts ?? []), [data?.alerts]);

  const visibleAlerts = useMemo(
    () => sortAlerts(filterAlerts(displayAlerts, activeTab, priorityFilter), sortBy),
    [displayAlerts, activeTab, priorityFilter, sortBy],
  );

  const customerRange = useMemo(() => {
    const metric = data?.whatChanged.metrics.find((m) => m.label === "Customers");
    return expectedCustomersRange(metric?.current);
  }, [data?.whatChanged.metrics]);

  const stockoutCount =
    data?.tomorrow.stockoutProducts?.length ??
    (data?.alerts.filter((a) => a.type === "STOCKOUT_RISK").length ?? 0);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageLoader />
      </div>
    );
  }

  if (!data || !shopId) return null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 pb-6 sm:space-y-5">
      <AppPageHeader
        title="Shop Autopilot"
        subtitle="Aapki dukaan ki roz ki samajh — data se action."
        action={
          <button
            type="button"
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 text-sm font-medium text-ink-muted shadow-soft hover:bg-paper-2 sm:w-auto"
            title="Autopilot uses your completed bills, stock, and customer data to suggest actions."
          >
            <Info className="size-4" />
            Learn More
          </button>
        }
      />

      <nav
        className="-mx-3 flex gap-1 overflow-x-auto border-b border-line/70 px-3 pb-px [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0"
        aria-label="Autopilot sections"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "shrink-0 px-3 py-2.5 text-sm font-medium transition-colors sm:px-4",
              activeTab === tab.id
                ? "border-b-2 border-forest text-forest"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

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

      <Surface className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div className="space-y-3">
          <p className="text-sm font-medium text-ink-muted">Shop Health</p>
          {data.health.available && data.health.score !== null ? (
            <>
              <p className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
                {data.health.score}
                <span className="text-xl text-ink-muted sm:text-2xl">/100</span>
              </p>
              <p className="text-sm text-ink-muted">
                {healthMessage(data.health.score)}
              </p>
              <div className="h-2.5 overflow-hidden rounded-full bg-paper-2">
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
          <div className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
            {data.health.components.sales !== null ? (
              <HealthMetric label="Sales" value={data.health.components.sales} />
            ) : null}
            {data.health.components.inventory !== null ? (
              <HealthMetric label="Inventory" value={data.health.components.inventory} />
            ) : null}
            {data.health.components.customers !== null ? (
              <HealthMetric label="Customers" value={data.health.components.customers} />
            ) : null}
            {data.health.components.cash !== null ? (
              <HealthMetric label="Cash" value={data.health.components.cash} />
            ) : null}
          </div>
        ) : null}
      </Surface>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <FilterPill
            active={priorityFilter === "all"}
            onClick={() => setPriorityFilter("all")}
            label={`All (${data.alerts.length})`}
            dark
          />
          <FilterPill
            active={priorityFilter === "critical"}
            onClick={() => setPriorityFilter("critical")}
            label={`Critical (${buckets.critical})`}
            dotClass="bg-danger"
          />
          <FilterPill
            active={priorityFilter === "attention"}
            onClick={() => setPriorityFilter("attention")}
            label={`Attention (${buckets.attention})`}
            dotClass="bg-orange-500"
          />
          <FilterPill
            active={priorityFilter === "opportunity"}
            onClick={() => setPriorityFilter("opportunity")}
            label={`Opportunity (${buckets.opportunity})`}
            dotClass="bg-success"
          />
        </div>

        <label className="inline-flex w-full items-center justify-between gap-2 text-sm text-ink-muted sm:w-auto sm:justify-start">
          Sort by:
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "priority" | "impact")
              }
              className="appearance-none rounded-xl border border-line bg-white py-2 pl-3 pr-8 text-sm font-medium text-ink shadow-soft"
            >
              <option value="priority">Priority</option>
              <option value="impact">Impact</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          </div>
        </label>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Today&apos;s Priorities</h2>

        {visibleAlerts.length === 0 ? (
          <Surface className="px-5 py-12 text-center">
            <p className="text-sm text-ink-muted">
              {activeTab === "customers"
                ? "Customer insights jald aa rahe hain — abhi koi alert nahi."
                : "Is filter ke liye koi priority nahi — sab theek lag raha hai."}
            </p>
          </Surface>
        ) : (
          <ul className="space-y-3">
            {visibleAlerts.map((alert) => {
              const bucket = alertBucket(alert.priority);
              return (
                <li key={alert.id}>
                  <Surface className="p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-1.5 size-2.5 shrink-0 rounded-full",
                          bucketDotClass(bucket),
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold break-words text-ink sm:text-base">
                          {alert.title}
                        </p>
                        <p className="mt-1 text-sm break-words text-ink-muted">
                          {alert.description}
                        </p>
                        {alert.reason ? (
                          <p className="mt-2 text-sm break-words text-ink-muted">
                            <span className="font-medium text-ink">Why:</span>{" "}
                            {alert.reason}
                          </p>
                        ) : null}
                        {alert.confidenceLabel ? (
                          <span className="mt-3 inline-flex rounded-lg bg-paper-2 px-2.5 py-1 text-xs font-medium text-ink-muted">
                            {alert.confidenceLabel}
                          </span>
                        ) : null}
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          {alert.actionPath ? (
                            <Link
                              to={alert.actionPath}
                              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-forest px-4 text-sm font-semibold text-white hover:bg-forest-2 sm:w-auto"
                            >
                              {actionButtonLabel(alert)}
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-line px-4 text-sm font-medium text-ink-muted hover:bg-paper-2 sm:w-auto"
                            onClick={() => void dismissAlert(alert)}
                          >
                            <X className="size-4" />
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </Surface>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Surface className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">
              Tomorrow Simulator (Preview)
            </h2>
            {!data.tomorrow.available ? (
              <p className="mt-1 text-sm text-ink-muted">
                {data.tomorrow.message}
              </p>
            ) : null}
          </div>
          {data.tomorrow.available ? (
            <button
              type="button"
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-line px-4 text-sm font-medium text-ink hover:bg-paper-2 sm:w-auto"
              onClick={() => setSimulatorOpen((open) => !open)}
            >
              {simulatorOpen ? "Close Simulator" : "Open Simulator"}
            </button>
          ) : null}
        </div>

        {data.tomorrow.available ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-3 sm:gap-4">
              <SimulatorMetric
                label="Expected Sales (Estimate)"
                value={`${formatINR(data.tomorrow.expectedSalesMin ?? 0)} – ${formatINR(data.tomorrow.expectedSalesMax ?? 0)}`}
                valueClass="text-success"
              />
              <SimulatorMetric
                label="Possible Stockouts"
                value={`${stockoutCount} items`}
                valueClass={stockoutCount > 0 ? "text-danger" : "text-ink"}
              />
              <SimulatorMetric
                label="Expected Customers"
                value={
                  customerRange
                    ? `${customerRange.min} – ${customerRange.max}`
                    : "—"
                }
                valueClass="text-sky-700"
              />
            </div>

            {simulatorOpen &&
            data.tomorrow.stockoutProducts &&
            data.tomorrow.stockoutProducts.length > 0 ? (
              <ul className="mt-4 space-y-2 border-t border-line/70 pt-4">
                {data.tomorrow.stockoutProducts.map((product) => (
                  <li
                    key={product.productId}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-ink">{product.name}</span>
                    <Link
                      to={`/purchases?productId=${product.productId}`}
                      className="font-medium text-forest hover:underline"
                    >
                      Reorder
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </Surface>
    </div>
  );
}

function HealthMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line/70 bg-paper-2/30 px-3 py-3 text-center">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold text-ink">
        {value}
        <span className="text-sm font-normal text-ink-muted">/100</span>
      </p>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  dotClass,
  dark,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dotClass?: string;
  dark?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
        active
          ? dark
            ? "bg-forest text-white"
            : "bg-paper-2 text-ink ring-1 ring-line"
          : "border border-line bg-white text-ink-muted hover:bg-paper-2",
      )}
    >
      {dotClass ? (
        <span className={cn("size-2 rounded-full", dotClass)} />
      ) : null}
      {label}
    </button>
  );
}

function SimulatorMetric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-line/70 bg-paper-2/20 px-4 py-3">
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p
        className={cn(
          "mt-1 text-base font-semibold break-words sm:text-lg",
          valueClass ?? "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}
