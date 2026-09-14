import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Bot,
  Box,
  ChevronRight,
  FileText,
  IndianRupee,
  ListChecks,
  Package,
  PackagePlus,
  Plus,
  Receipt,
  Store,
  Users,
} from "lucide-react";
import { APP_NAME } from "@shop-os/shared";
import { PageLoader } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";

type RecentBill = {
  _id: string;
  invoiceNumber: string;
  customerName: string | null;
  total: number;
  completedAt: string | null;
  itemCount?: number;
  paymentMethod?: string | null;
};

type Summary = {
  todaySalesTotal: number;
  todaySalesCount: number;
  todaySalesGrowthPct: number | null;
  todayBillsGrowthPct: number | null;
  lowStockCount: number;
  totalProductsCount: number;
  recentBills: RecentBill[];
};

function greetingForHour(hour: number) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatBillTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function growthVsYesterday(pct: number | null) {
  if (pct === null) return { text: "vs yesterday", up: true as boolean | null };
  if (pct === 0) return { text: "Same as yesterday", up: null };
  const arrow = pct > 0 ? "↑" : "↓";
  return {
    text: `${arrow} ${Math.abs(Math.round(pct))}% vs yesterday`,
    up: pct > 0,
  };
}

function paymentTone(method: string | null | undefined) {
  const m = (method || "").toUpperCase();
  if (m === "UPI") {
    return { label: "UPI", className: "bg-emerald-50 text-emerald-700" };
  }
  if (m === "CASH") {
    return { label: "Cash", className: "bg-sky-50 text-sky-700" };
  }
  if (m === "CARD" || m === "ONLINE" || m === "BANK") {
    return { label: "Online", className: "bg-violet-50 text-violet-700" };
  }
  if (m === "CREDIT") {
    return { label: "Udhaar", className: "bg-amber-50 text-amber-800" };
  }
  return { label: method || "Paid", className: "bg-paper-2 text-ink-muted" };
}

function billIconTone(method: string | null | undefined) {
  const m = (method || "").toUpperCase();
  if (m === "UPI") return "bg-emerald-50 text-emerald-700";
  if (m === "CASH") return "bg-sky-50 text-sky-700";
  if (m === "CARD" || m === "ONLINE" || m === "BANK") {
    return "bg-violet-50 text-violet-700";
  }
  return "bg-forest/10 text-forest";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SO";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function ShopHeroArt() {
  return (
    <svg
      viewBox="0 0 140 110"
      className="h-[88px] w-[112px] shrink-0 sm:h-[100px] sm:w-[128px]"
      aria-hidden
    >
      <circle cx="108" cy="22" r="14" fill="#F6D978" opacity="0.9" />
      <path
        d="M18 78c10-22 28-34 48-38 8 14 6 28-2 40-16 4-32 4-46-2Z"
        fill="#9FD0B8"
        opacity="0.55"
      />
      <path
        d="M92 86c8-16 22-24 38-26-2 12-8 22-18 28-8 2-14 2-20-2Z"
        fill="#9FD0B8"
        opacity="0.45"
      />
      <rect x="34" y="42" width="72" height="48" rx="8" fill="#0F3D2E" />
      <path d="M28 48 L70 22 L112 48 Z" fill="#2F8F6B" />
      <rect x="58" y="58" width="24" height="32" rx="3" fill="#E6F4EE" />
      <rect x="42" y="58" width="12" height="12" rx="2" fill="#7EC8E3" />
      <rect x="86" y="58" width="12" height="12" rx="2" fill="#F0B070" />
      <rect x="20" y="88" width="100" height="6" rx="3" fill="#1B3022" />
    </svg>
  );
}

const QUICK_ACTIONS = [
  {
    to: "/bill",
    title: "New Bill",
    sub: "Create a new bill",
    icon: Plus,
    tone: "bg-emerald-50 text-emerald-700",
  },
  {
    to: "/products",
    title: "Add Product",
    sub: "Add new item",
    icon: PackagePlus,
    tone: "bg-sky-50 text-sky-700",
  },
  {
    to: "/inventory",
    title: "Inventory",
    sub: "Check stock",
    icon: ListChecks,
    tone: "bg-violet-50 text-violet-700",
  },
  {
    to: "/customers",
    title: "Customers",
    sub: "View customers",
    icon: Users,
    tone: "bg-orange-50 text-orange-700",
  },
] as const;

export function HomePage() {
  const { activeShop, user } = useAuth();
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
  const shopName = activeShop?.name ?? "Your shop";
  const avatarLabel = initials(user?.name || shopName);
  const bills = summary?.recentBills ?? [];
  const salesGrowth = growthVsYesterday(summary?.todaySalesGrowthPct ?? null);
  const billsGrowth = growthVsYesterday(summary?.todayBillsGrowthPct ?? null);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 pb-2 sm:space-y-5 lg:max-w-none">
      {/* Top brand bar — mock header */}
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-forest text-white shadow-soft">
            <Store className="size-[18px]" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-base font-bold leading-none text-forest">
              {APP_NAME}
            </p>
            <p className="mt-1 truncate text-[11px] font-medium text-ink-muted">
              Smart Shop Management
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to="/more"
            className="relative inline-flex size-10 items-center justify-center rounded-full border border-line/70 bg-white text-ink-muted shadow-soft"
            aria-label="Notifications"
          >
            <Bell className="size-4" />
            <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">
              3
            </span>
          </Link>
          <Link
            to="/more"
            className="inline-flex size-10 items-center justify-center rounded-full bg-forest text-xs font-bold text-white shadow-soft"
            aria-label="Profile"
          >
            {avatarLabel}
          </Link>
        </div>
      </header>

      {/* Greeting hero */}
      <section className="overflow-hidden rounded-[22px] border border-[#d7ebe1] bg-[#E6F4EE] px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[1.35rem] font-bold leading-tight tracking-tight text-ink sm:text-2xl">
              {greeting}, {shopName}{" "}
              <span aria-hidden>👋</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Manage your shop, track sales, and grow your business — all in one
              place.
            </p>
          </div>
          <ShopHeroArt />
        </div>
      </section>

      {loading ? (
        <PageLoader />
      ) : (
        <>
          {/* Quick actions — 2×2 mobile · 4 across desktop */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="rounded-2xl border border-line/70 bg-white p-3.5 shadow-soft transition-colors hover:bg-paper-2/40"
              >
                <span
                  className={cn(
                    "mb-3 inline-flex size-9 items-center justify-center rounded-xl",
                    action.tone,
                  )}
                >
                  <action.icon className="size-4" strokeWidth={2.25} />
                </span>
                <p className="text-sm font-semibold text-ink">{action.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-muted">{action.sub}</p>
              </Link>
            ))}
          </section>

          {/* Metrics — 2×2 mobile · 4 across desktop */}
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              icon={IndianRupee}
              tone="bg-emerald-50 text-emerald-700"
              label="Today's Sales"
              value={formatINR(summary?.todaySalesTotal ?? 0)}
              footer={salesGrowth.text}
              footerClass={
                salesGrowth.up === null
                  ? "text-ink-muted"
                  : salesGrowth.up
                    ? "text-success"
                    : "text-danger"
              }
            />
            <MetricCard
              icon={Receipt}
              tone="bg-sky-50 text-sky-700"
              label="Total Bills"
              value={String(summary?.todaySalesCount ?? 0)}
              footer={billsGrowth.text}
              footerClass={
                billsGrowth.up === null
                  ? "text-ink-muted"
                  : billsGrowth.up
                    ? "text-success"
                    : "text-danger"
              }
            />
            <MetricCard
              icon={Box}
              tone="bg-violet-50 text-violet-700"
              label="Low Stock"
              value={String(summary?.lowStockCount ?? 0)}
              footer="View →"
              footerClass="text-violet-700"
              to="/inventory"
            />
            <MetricCard
              icon={Package}
              tone="bg-orange-50 text-orange-700"
              label="Total Products"
              value={String(summary?.totalProductsCount ?? 0)}
              footer="View →"
              footerClass="text-orange-700"
              to="/products"
            />
          </section>

          {/* Recent Bills */}
          <section className="overflow-hidden rounded-2xl border border-line/70 bg-white shadow-soft">
            <div className="flex items-center justify-between gap-3 px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <FileText className="size-4" />
                </span>
                <h2 className="text-base font-semibold text-ink">Recent Bills</h2>
              </div>
              <Link
                to="/reports"
                className="text-sm font-medium text-forest hover:underline"
              >
                View All →
              </Link>
            </div>

            {bills.length === 0 ? (
              <p className="px-4 pb-5 text-sm text-ink-muted">
                Abhi koi bill nahi — pehla bill banao.
              </p>
            ) : (
              <ul className="divide-y divide-line/60 border-t border-line/60">
                {bills.map((bill) => {
                  const pay = paymentTone(bill.paymentMethod);
                  const items = bill.itemCount ?? 0;
                  return (
                    <li key={bill._id}>
                      <Link
                        to={`/invoice/${bill._id}`}
                        className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-paper-2/40"
                      >
                        <span
                          className={cn(
                            "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
                            billIconTone(bill.paymentMethod),
                          )}
                        >
                          <Receipt className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">
                            #{bill.invoiceNumber}
                          </p>
                          <p className="mt-0.5 truncate text-xs text-ink-muted">
                            {items} item{items === 1 ? "" : "s"} •{" "}
                            {formatBillTime(bill.completedAt)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                              pay.className,
                            )}
                          >
                            {pay.label}
                          </span>
                          <p className="text-sm font-semibold text-ink">
                            {formatINR(bill.total)}
                          </p>
                          <ChevronRight className="size-4 text-ink-muted" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Shop Autopilot promo — mock card */}
          <section className="rounded-2xl border border-[#b8dcc9] bg-[#E6F4EE] p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-forest shadow-soft">
                <Bot className="size-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-bold text-ink">Shop Autopilot</h2>
                  <span className="rounded-full bg-forest px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    New
                  </span>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-ink-muted">
                  <li>• Auto reorder suggestions</li>
                  <li>• Low stock alerts</li>
                  <li>• Smart sales insights</li>
                </ul>
                <div className="mt-3 flex justify-end">
                  <Link
                    to="/autopilot"
                    className="inline-flex h-9 items-center gap-1 rounded-xl bg-forest px-3.5 text-sm font-semibold text-white"
                  >
                    Open
                    <ChevronRight className="size-4" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  tone,
  label,
  value,
  footer,
  footerClass,
  to,
}: {
  icon: typeof IndianRupee;
  tone: string;
  label: string;
  value: string;
  footer: string;
  footerClass?: string;
  to?: string;
}) {
  const body = (
    <>
      <span
        className={cn(
          "mb-3 inline-flex size-9 items-center justify-center rounded-xl",
          tone,
        )}
      >
        <Icon className="size-4" strokeWidth={2.25} />
      </span>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-bold tracking-tight text-ink sm:text-2xl">
        {value}
      </p>
      <p className={cn("mt-2 text-xs font-semibold", footerClass)}>{footer}</p>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-2xl border border-line/70 bg-white p-3.5 text-left shadow-soft transition-colors hover:bg-paper-2/40"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="rounded-2xl border border-line/70 bg-white p-3.5 text-left shadow-soft">
      {body}
    </div>
  );
}
