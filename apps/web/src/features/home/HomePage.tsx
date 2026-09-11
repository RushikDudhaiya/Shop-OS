import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  FileText,
  Plus,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { PageLoader, Surface } from "@/components/ui";
import { ShopAutopilotSection } from "@/features/autopilot/ShopAutopilotSection";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";

type RecentBill = {
  _id: string;
  invoiceNumber: string;
  customerName: string | null;
  total: number;
  completedAt: string | null;
};

type Summary = {
  todaySalesTotal: number;
  todaySalesCount: number;
  monthSalesTotal: number;
  lastMonthSalesTotal: number;
  monthSalesGrowthPct: number | null;
  udhaarOutstanding: number;
  udhaarCustomerCount: number;
  lowStockCount: number;
  expensesTotal: number;
  todayExpensesTotal: number;
  yesterdayExpensesTotal: number;
  expensesDeltaVsYesterday: number;
  recentBills: RecentBill[];
};

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function formatDashboardDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    weekday: "short",
  }).format(date);
}

function formatBillTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function expenseDeltaLabel(delta: number) {
  if (delta === 0) return "Same as yesterday";
  if (delta > 0) return `${formatINR(delta)} more than yesterday`;
  return `${formatINR(Math.abs(delta))} less than yesterday`;
}

function growthLabel(pct: number | null) {
  if (pct === null) return "No prior month data";
  if (pct === 0) return "Same as last month";
  const sign = pct > 0 ? "+" : "-";
  return `${sign} ${Math.abs(pct)}% vs last month`;
}

function customerCountLabel(count: number) {
  return count === 1 ? "1 customer" : `${count} customers`;
}

export function HomePage() {
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!shopId) return;
    void (async () => {
      setLoading(true);
      try {
        const data = await api<Summary>(
          `/api/shops/${shopId}/reports/summary`,
        );
        setSummary(data);
      } catch {
        setSummary(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId]);

  const greeting = useMemo(
    () => greetingForHour(now.getHours()),
    [now],
  );
  const dateLabel = useMemo(() => formatDashboardDate(now), [now]);
  const shopName = activeShop?.name ?? "Your shop";
  const bills = summary?.recentBills ?? [];
  const lowStock = summary?.lowStockCount ?? 0;
  const growthPct = summary?.monthSalesGrowthPct ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight break-words text-ink sm:text-3xl md:text-4xl">
            {greeting}, {shopName}{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted md:text-base">
            Aaj ka din shandar banate hain!
          </p>
        </div>
        <div className="inline-flex w-fit shrink-0 items-center gap-2 rounded-2xl border border-line/80 bg-white px-3 py-2 shadow-soft sm:px-3.5 sm:py-2.5">
          <CalendarDays className="size-4 text-forest" />
          <span className="text-xs font-medium text-ink sm:text-sm">{dateLabel}</span>
        </div>
      </header>

      {loading ? (
        <PageLoader />
      ) : (
        <>
          <Surface className="space-y-5 p-4 sm:p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-muted">
                  Aaj ki bikri
                </p>
                <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl md:text-5xl">
                  {formatINR(summary?.todaySalesTotal ?? 0)}
                </p>
                <p className="mt-1.5 text-sm text-ink-muted">
                  {summary?.todaySalesCount ?? 0} sales
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-semibold text-success">
                <span className="size-1.5 rounded-full bg-success" />
                Live
              </span>
            </div>

            <Link
              to="/bill"
              className={cn(
                "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl sm:h-14",
                "bg-gold text-base font-semibold text-ink shadow-soft transition-colors hover:bg-gold-2",
              )}
            >
              <Plus className="size-5" />
              Naya Bill
            </Link>
          </Surface>

          {shopId ? <ShopAutopilotSection shopId={shopId} /> : null}

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink">Quick Overview</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={TrendingUp}
                iconClass="bg-success-soft text-success"
                label="Is mahine ki bikri"
                value={formatINR(summary?.monthSalesTotal ?? 0)}
                footer={growthLabel(growthPct)}
                footerClass={
                  growthPct === null
                    ? "text-ink-muted"
                    : growthPct >= 0
                      ? "text-success"
                      : "text-danger"
                }
              />
              <Link to="/customers" className="block">
                <StatCard
                  icon={Users}
                  iconClass="bg-sky-100 text-sky-700"
                  label="Udhaar baaki"
                  value={formatINR(summary?.udhaarOutstanding ?? 0)}
                  footer={customerCountLabel(summary?.udhaarCustomerCount ?? 0)}
                  footerClass="text-sky-700"
                />
              </Link>
              <Link to="/inventory" className="block">
                <StatCard
                  icon={AlertTriangle}
                  iconClass="bg-orange-100 text-orange-700"
                  label="Low stock"
                  value={`${lowStock} items`}
                  footer={lowStock > 0 ? "Restock needed" : "Stock theek hai"}
                  footerClass={lowStock > 0 ? "text-danger" : "text-orange-700"}
                />
              </Link>
              <Link to="/expenses" className="block">
                <StatCard
                  icon={Wallet}
                  iconClass="bg-violet-100 text-violet-700"
                  label="Kharcha"
                  value={formatINR(summary?.expensesTotal ?? 0)}
                  footer={expenseDeltaLabel(
                    summary?.expensesDeltaVsYesterday ?? 0,
                  )}
                  footerClass="text-violet-700"
                />
              </Link>
            </div>
          </section>

          <Surface padded={false} className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
              <h2 className="text-base font-semibold text-ink">Recent Bills</h2>
              <Link
                to="/reports"
                className="text-sm font-medium text-forest hover:underline"
              >
                Sabhi Bills →
              </Link>
            </div>

            {bills.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-muted">
                Abhi koi bill nahi — pehla bill banao.
              </p>
            ) : (
              <ul className="divide-y divide-line/70">
                {bills.map((bill) => (
                  <li key={bill._id}>
                    <Link
                      to={`/invoice/${bill._id}`}
                      className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-paper-2/50"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-forest/10 text-forest">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          Bill #{bill.invoiceNumber}
                        </p>
                        <p className="truncate text-xs text-ink-muted">
                          {bill.customerName || "Walk-in Customer"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-ink">
                          {formatINR(bill.total)}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatBillTime(bill.completedAt)}
                        </p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-ink-muted" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  footer,
  footerClass,
}: {
  icon: typeof TrendingUp;
  iconClass: string;
  label: string;
  value: string;
  footer: string;
  footerClass?: string;
}) {
  return (
    <Surface className="h-full space-y-3 transition-colors hover:bg-paper-2/30">
      <span
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-xl",
          iconClass,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
          {value}
        </p>
      </div>
      <p className={cn("text-xs font-medium", footerClass)}>{footer}</p>
    </Surface>
  );
}
