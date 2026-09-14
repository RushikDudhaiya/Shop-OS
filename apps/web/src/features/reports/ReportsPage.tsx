import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CalendarDays,
  Download,
  FileText,
  MoreVertical,
  Package,
  Receipt,
  Search,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import {
  AppPageHeader,
  Button,
  EmptyState,
  PageLoader,
  Pagination,
  Surface,
} from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";

type TabId = "overview" | "sales" | "inventory" | "customers";

type AnalyticsResponse = {
  range: { from: string; to: string };
  kpis: {
    salesTotal: number;
    salesChangePct: number | null;
    billsCount: number;
    billsChangePct: number | null;
    avgBill: number;
    avgBillChangePct: number | null;
    customersCount: number;
    customersChangePct: number | null;
  };
  daily: Array<{
    date: string;
    label: string;
    salesTotal: number;
    billsCount: number;
  }>;
  byCategory: Array<{ name: string; revenue: number; pct: number }>;
  quickStats: {
    todaySales: number;
    weekSales: number;
    bestProduct: { name: string; productId: string } | null;
    lowStockCount: number;
    pendingPurchasesCount: number;
  };
  topProducts: Array<{
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
    imageUrl: string | null;
  }>;
  recentBills: Array<{
    _id: string;
    invoiceNumber: string;
    itemCount: number;
    total: number;
    completedAt: string | null;
  }>;
  stockStatus: Array<{
    productId: string;
    name: string;
    stock: number;
    status: "out" | "low" | "good";
    imageUrl: string | null;
  }>;
};

type CustomerOption = { _id: string; name: string };

type BillRow = {
  _id: string;
  invoiceNumber: string;
  customerId: string | null;
  customerName: string | null;
  total: number;
  itemCount: number;
  itemsQty: number;
  paymentMethod: string | null;
  completedAt: string | null;
};

type BillsResponse = {
  range: { from: string; to: string };
  summary: {
    salesTotal: number;
    salesCount: number;
    avgBill: number;
    customerCount: number;
    itemsSold: number;
  };
  items: BillRow[];
  page: number;
  pageSize: number;
  total: number;
};

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "sales", label: "Sales" },
  { id: "inventory", label: "Inventory" },
  { id: "customers", label: "Customers" },
];

const CATEGORY_COLORS = [
  "#0f766e",
  "#16a34a",
  "#ea580c",
  "#2563eb",
  "#7c3aed",
  "#94a3b8",
];

const PAGE_SIZE = 8;

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatRangeLabel(from: string, to: string) {
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(iso.includes("T") ? iso : `${iso}T12:00:00`));
  return `${fmt(from)} - ${fmt(to)}`;
}

type PeriodPreset = "today" | "week" | "month";

const PERIOD_OPTIONS: { id: PeriodPreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
];

function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function rangeForPeriod(preset: PeriodPreset, now = new Date()) {
  const today = startOfLocalDay(now);
  const to = toDateInput(today);
  if (preset === "today") return { from: to, to };

  if (preset === "week") {
    const day = today.getDay(); // 0 = Sun
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    return { from: toDateInput(monday), to };
  }

  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return { from: toDateInput(first), to };
}

function matchPeriodPreset(
  from: string,
  to: string,
  now = new Date(),
): PeriodPreset | null {
  for (const opt of PERIOD_OPTIONS) {
    const r = rangeForPeriod(opt.id, now);
    if (r.from === from && r.to === to) return opt.id;
  }
  return null;
}

function formatBillTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function formatBillDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function changeLabel(pct: number | null) {
  if (pct === null) return "No prior week data";
  if (pct === 0) return "Same as last week";
  const arrow = pct > 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(pct)}% vs last week`;
}

function paymentLabel(method: string | null) {
  if (!method) return "—";
  const map: Record<string, string> = {
    CASH: "Cash",
    UPI: "UPI",
    CARD: "Card",
    CREDIT: "Credit",
    BANK_TRANSFER: "Bank",
  };
  return map[method] ?? method;
}

function paymentTone(method: string | null) {
  switch (method) {
    case "CASH":
      return "bg-success-soft text-success";
    case "UPI":
      return "bg-sky-100 text-sky-700";
    case "CARD":
      return "bg-violet-100 text-violet-700";
    case "CREDIT":
      return "bg-orange-100 text-orange-700";
    default:
      return "bg-paper-2 text-ink-muted";
  }
}

function stockBadge(status: "out" | "low" | "good") {
  if (status === "out") {
    return {
      label: "Out of Stock",
      className: "bg-danger-soft text-danger",
    };
  }
  if (status === "low") {
    return {
      label: "Low Stock",
      className: "bg-orange-100 text-orange-700",
    };
  }
  return {
    label: "Good Stock",
    className: "bg-success-soft text-success",
  };
}

export function ReportsPage() {
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const navigate = useNavigate();

  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(() =>
    toDateInput(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)),
  );
  const [to, setTo] = useState(() => toDateInput(now));
  const [tab, setTab] = useState<TabId>("overview");

  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sales tab (bills list)
  const [customerId, setCustomerId] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [billsData, setBillsData] = useState<BillsResponse | null>(null);
  const [billsLoading, setBillsLoading] = useState(false);
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [from, to, customerId, debouncedQ]);

  const loadAnalytics = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from, to });
      const res = await api<AnalyticsResponse>(
        `/api/shops/${shopId}/reports/analytics?${params}`,
      );
      setAnalytics(res);
    } catch {
      setError("Reports load nahi ho paye");
      setAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [shopId, from, to]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    if (!shopId || tab !== "sales") return;
    void (async () => {
      try {
        const res = await api<{ customers: CustomerOption[] }>(
          `/api/shops/${shopId}/customers?q=`,
        );
        setCustomers(res.customers);
      } catch {
        setCustomers([]);
      }
    })();
  }, [shopId, tab]);

  const loadBills = useCallback(async () => {
    if (!shopId || tab !== "sales") return;
    setBillsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        from,
        to,
      });
      if (customerId) params.set("customerId", customerId);
      if (debouncedQ) params.set("q", debouncedQ);
      const res = await api<BillsResponse>(
        `/api/shops/${shopId}/sales?${params}`,
      );
      setBillsData(res);
    } catch {
      setBillsData(null);
    } finally {
      setBillsLoading(false);
    }
  }, [shopId, tab, page, from, to, customerId, debouncedQ]);

  useEffect(() => {
    void loadBills();
  }, [loadBills]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function exportCsv() {
    if (!analytics) return;
    const rows: string[][] = [
      ["Metric", "Value"],
      ["Total Sales", String(analytics.kpis.salesTotal)],
      ["Total Bills", String(analytics.kpis.billsCount)],
      ["Avg Order Value", String(analytics.kpis.avgBill)],
      ["Customers", String(analytics.kpis.customersCount)],
      [],
      ["Date", "Sales", "Bills"],
      ...analytics.daily.map((d) => [
        d.date,
        String(d.salesTotal),
        String(d.billsCount),
      ]),
      [],
      ["Product", "Qty", "Revenue"],
      ...analytics.topProducts.map((p) => [
        p.name,
        String(p.quantity),
        String(p.revenue),
      ]),
    ];
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!shopId) return <PageLoader />;

  const maxDailySales = Math.max(
    1,
    ...(analytics?.daily.map((d) => d.salesTotal) ?? [1]),
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-4">
      <AppPageHeader
        title="Reports"
        subtitle="Here's how your shop performed in this period."
        action={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto">
            <div className="flex w-full flex-col gap-1.5 sm:w-auto">
              <span className="hidden text-xs font-medium text-ink-muted sm:block">
                {formatRangeLabel(from, to)}
              </span>
              <label className="flex w-full flex-col gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink shadow-soft sm:inline-flex sm:h-11 sm:w-auto sm:flex-row sm:items-center sm:gap-2 sm:py-0">
                <CalendarDays className="size-4 shrink-0 text-forest" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <input
                    type="date"
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none sm:w-[9.5rem] sm:flex-none"
                    value={from}
                    max={to}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                  <span className="text-ink-muted">-</span>
                  <input
                    type="date"
                    className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none sm:w-[9.5rem] sm:flex-none"
                    value={to}
                    min={from}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
              </label>
            </div>
            <Button
              variant="primary"
              className="w-full sm:w-auto"
              leftIcon={<Download className="size-4" />}
              onClick={exportCsv}
              disabled={!analytics}
            >
              Export Report
            </Button>
          </div>
        }
      />

      <div>
        <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl md:text-3xl">
          Reports & Analytics
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Track your sales, inventory, and business performance all in one
          place.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <nav
          className="-mx-3 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:min-w-0 sm:flex-1 sm:px-0"
          aria-label="Reports tabs"
        >
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                tab === item.id
                  ? "bg-forest text-white shadow-soft"
                  : "border border-line bg-white text-ink-muted hover:bg-paper-2",
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div
          className="inline-flex shrink-0 gap-0.5 rounded-xl border border-line bg-white p-1 shadow-soft"
          role="group"
          aria-label="Report period"
        >
          {PERIOD_OPTIONS.map((opt) => {
            const active = matchPeriodPreset(from, to) === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  const next = rangeForPeriod(opt.id);
                  setFrom(next.from);
                  setTo(next.to);
                }}
                className={cn(
                  "shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors",
                  active
                    ? "bg-[#1a1c2e] text-white"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <PageLoader />
      ) : error || !analytics ? (
        <Surface className="space-y-3 p-5">
          <p className="text-sm text-danger">{error ?? "No data"}</p>
          <Button variant="secondary" onClick={() => void loadAnalytics()}>
            Retry
          </Button>
        </Surface>
      ) : (
        <>
          {tab === "overview" ? (
            <OverviewTab
              data={analytics}
              maxDailySales={maxDailySales}
              rangeLabel={formatRangeLabel(from, to)}
              onOpenSales={() => setTab("sales")}
              onOpenInventory={() => setTab("inventory")}
            />
          ) : null}

          {tab === "sales" ? (
            <SalesTab
              summary={analytics.kpis}
              billsData={billsData}
              billsLoading={billsLoading}
              customers={customers}
              customerId={customerId}
              setCustomerId={setCustomerId}
              q={q}
              setQ={setQ}
              page={page}
              setPage={setPage}
              menuId={menuId}
              setMenuId={setMenuId}
              menuRef={menuRef}
              navigate={navigate}
            />
          ) : null}

          {tab === "inventory" ? (
            <InventoryTab data={analytics} />
          ) : null}

          {tab === "customers" ? (
            <CustomersTab data={analytics} />
          ) : null}
        </>
      )}
    </div>
  );
}

function OverviewTab({
  data,
  maxDailySales,
  rangeLabel,
  onOpenSales,
  onOpenInventory,
}: {
  data: AnalyticsResponse;
  maxDailySales: number;
  rangeLabel: string;
  onOpenSales: () => void;
  onOpenInventory: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={Wallet}
          iconClass="bg-emerald-50 text-emerald-700"
          label="Total Sales"
          value={formatINR(data.kpis.salesTotal)}
          change={data.kpis.salesChangePct}
        />
        <KpiCard
          icon={FileText}
          iconClass="bg-sky-50 text-sky-700"
          label="Total Bills"
          value={String(data.kpis.billsCount)}
          change={data.kpis.billsChangePct}
        />
        <KpiCard
          icon={ShoppingCart}
          iconClass="bg-violet-50 text-violet-700"
          label="Avg. Order Value"
          value={formatINR(data.kpis.avgBill)}
          change={data.kpis.avgBillChangePct}
        />
        <KpiCard
          icon={Users}
          iconClass="bg-orange-50 text-orange-700"
          label="Total Customers"
          value={String(data.kpis.customersCount)}
          change={data.kpis.customersChangePct}
        />
      </section>

      <section className="grid min-w-0 gap-4 xl:grid-cols-[1.45fr_1fr_0.85fr]">
        <Surface className="min-w-0 space-y-3 overflow-hidden p-4 sm:p-5">
          <div>
            <h3 className="text-base font-semibold text-ink">Sales trend</h3>
            <p className="mt-0.5 text-sm text-ink-muted">
              Daily sales — {rangeLabel}
            </p>
          </div>
          <SalesOverviewChart daily={data.daily} maxSales={maxDailySales} />
        </Surface>

        <Surface className="space-y-4 p-4 sm:p-5">
          <h3 className="text-base font-semibold text-ink">Sales by Category</h3>
          <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
            <CategoryDonut
              slices={data.byCategory}
              total={
                data.byCategory.reduce((s, c) => s + c.revenue, 0) ||
                data.kpis.salesTotal
              }
            />
            <ul className="w-full min-w-0 space-y-2.5">
              {data.byCategory.length === 0 ? (
                <li className="text-sm text-ink-muted">No category sales yet.</li>
              ) : (
                data.byCategory.map((slice, i) => (
                  <li
                    key={slice.name}
                    className="flex items-start justify-between gap-3 text-sm"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span
                        className="mt-1 size-2.5 shrink-0 rounded-full"
                        style={{
                          background:
                            CATEGORY_COLORS[i % CATEGORY_COLORS.length],
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-ink">
                          {slice.name}
                        </span>
                        <span className="text-xs text-ink-muted">
                          {formatINR(slice.revenue)}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold text-ink">
                      {slice.pct}%
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </Surface>

        <Surface className="p-4 sm:p-5">
          <h3 className="mb-2 text-base font-semibold text-ink">Quick Stats</h3>
          <div className="divide-y divide-line/60">
            <QuickStat
              icon={TrendingUp}
              iconClass="bg-emerald-50 text-emerald-700"
              label="Today's Sales"
              value={formatINR(data.quickStats.todaySales)}
            />
            <QuickStat
              icon={Wallet}
              iconClass="bg-sky-50 text-sky-700"
              label="This Week's Sales"
              value={formatINR(data.quickStats.weekSales)}
            />
            <QuickStat
              icon={ShoppingBag}
              iconClass="bg-violet-50 text-violet-700"
              label="Best Selling Product"
              value={data.quickStats.bestProduct?.name ?? "—"}
            />
            <QuickStat
              icon={AlertTriangle}
              iconClass="bg-orange-50 text-orange-700"
              label="Low Stock Items"
              value={`${data.quickStats.lowStockCount} items`}
              valueClass={
                data.quickStats.lowStockCount > 0
                  ? "text-orange-700"
                  : undefined
              }
            />
            <QuickStat
              icon={Truck}
              iconClass="bg-slate-100 text-slate-700"
              label="Pending Purchases"
              value={`${data.quickStats.pendingPurchasesCount} items`}
            />
          </div>
        </Surface>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Surface padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line/70 px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-semibold text-ink">Top Products</h3>
            <button
              type="button"
              onClick={onOpenSales}
              className="text-xs font-medium text-forest hover:underline"
            >
              View All →
            </button>
          </div>
          {data.topProducts.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">
              Abhi top products nahi.
            </p>
          ) : (
            <>
              <div className="hidden grid-cols-[28px_1fr_70px_90px] gap-2 border-b border-line/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted sm:grid">
                <span>#</span>
                <span>Product</span>
                <span className="text-right">Qty Sold</span>
                <span className="text-right">Revenue</span>
              </div>
              <ul className="divide-y divide-line/60">
                {data.topProducts.map((p, idx) => (
                  <li
                    key={p.productId}
                    className="grid grid-cols-[28px_1fr_auto] items-center gap-2 px-4 py-3 sm:grid-cols-[28px_1fr_70px_90px] sm:px-5"
                  >
                    <span className="text-xs font-semibold text-ink-muted">
                      {idx + 1}
                    </span>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <ProductAvatar name={p.name} imageUrl={p.imageUrl} />
                      <p className="truncate text-sm font-medium text-ink">
                        {p.name}
                      </p>
                    </div>
                    <p className="hidden text-right text-sm text-ink-muted sm:block">
                      {p.quantity}
                    </p>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-ink">
                        {formatINR(p.revenue)}
                      </p>
                      <p className="text-[11px] text-ink-muted sm:hidden">
                        Qty {p.quantity}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Surface>

        <Surface padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line/70 px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-semibold text-ink">Recent Bills</h3>
            <button
              type="button"
              onClick={onOpenSales}
              className="text-xs font-medium text-forest hover:underline"
            >
              View All →
            </button>
          </div>
          {data.recentBills.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">
              Recent bills nahi.
            </p>
          ) : (
            <>
              <div className="hidden grid-cols-[1.2fr_0.7fr_0.9fr_0.8fr] gap-2 border-b border-line/50 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted sm:grid">
                <span>Bill No.</span>
                <span>Items</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Time</span>
              </div>
              <ul className="divide-y divide-line/60">
                {data.recentBills.map((bill) => (
                  <li key={bill._id}>
                    <Link
                      to={`/invoice/${bill._id}`}
                      className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-paper-2/50 sm:grid-cols-[1.2fr_0.7fr_0.9fr_0.8fr] sm:px-5"
                    >
                      <span className="flex min-w-0 items-center gap-2 sm:contents">
                        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-forest/10 text-forest sm:hidden">
                          <Receipt className="size-3.5" />
                        </span>
                        <span className="truncate text-sm font-semibold text-ink">
                          #{bill.invoiceNumber}
                        </span>
                      </span>
                      <span className="hidden text-sm text-ink-muted sm:block">
                        {bill.itemCount} items
                      </span>
                      <span className="text-right text-sm font-semibold text-ink">
                        {formatINR(bill.total)}
                      </span>
                      <span className="hidden text-right text-sm text-ink-muted sm:block">
                        {formatBillTime(bill.completedAt)}
                      </span>
                      <span className="col-span-3 text-xs text-ink-muted sm:hidden">
                        {bill.itemCount} items · {formatBillTime(bill.completedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Surface>

        <Surface padded={false} className="overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-line/70 px-4 py-3.5 sm:px-5">
            <h3 className="text-sm font-semibold text-ink">Stock Status</h3>
            <button
              type="button"
              onClick={onOpenInventory}
              className="text-xs font-medium text-forest hover:underline"
            >
              View All →  
            </button>
          </div>
          {data.stockStatus.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-ink-muted">
              Stock data nahi.
            </p>
          ) : (
            <ul className="divide-y divide-line/60">
              {data.stockStatus.map((item) => {
                const badge = stockBadge(item.status);
                return (
                  <li
                    key={item.productId}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <ProductAvatar name={item.name} imageUrl={item.imageUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">
                        {item.name}
                      </p>
                      <p className="text-xs text-ink-muted">
                        Stock: {item.stock}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>
      </section>
    </div>
  );
}

function SalesTab({
  summary,
  billsData,
  billsLoading,
  customers,
  customerId,
  setCustomerId,
  q,
  setQ,
  page,
  setPage,
  menuId,
  setMenuId,
  menuRef,
  navigate,
}: {
  summary: AnalyticsResponse["kpis"];
  billsData: BillsResponse | null;
  billsLoading: boolean;
  customers: CustomerOption[];
  customerId: string;
  setCustomerId: (v: string) => void;
  q: string;
  setQ: (v: string) => void;
  page: number;
  setPage: (v: number) => void;
  menuId: string | null;
  setMenuId: (v: string | null) => void;
  menuRef: RefObject<HTMLDivElement | null>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const bills = billsData?.items ?? [];

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <Surface className="p-4">
          <p className="text-xs text-ink-muted">Sales</p>
          <p className="mt-1 font-display text-2xl font-semibold">
            {formatINR(summary.salesTotal)}
          </p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs text-ink-muted">Bills</p>
          <p className="mt-1 font-display text-2xl font-semibold">
            {summary.billsCount}
          </p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs text-ink-muted">Avg Bill</p>
          <p className="mt-1 font-display text-2xl font-semibold">
            {formatINR(summary.avgBill)}
          </p>
        </Surface>
      </section>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <select
          className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-soft lg:w-auto"
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
        >
          <option value="">All Customers</option>
          {customers.map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="relative w-full min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bill no. or customer"
            className="h-11 w-full rounded-xl border border-line bg-white pl-9 pr-3 text-sm shadow-soft"
          />
        </label>
      </div>

      <Surface padded={false} className="overflow-hidden">
        {billsLoading ? (
          <PageLoader />
        ) : bills.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-7" />}
            title="No bills in range"
            description="Date change karke dekho ya naya bill banao."
          />
        ) : (
          <>
            <div className="hidden grid-cols-[1.1fr_1.2fr_0.7fr_0.9fr_1.1fr_auto] gap-2 border-b border-line/50 px-5 py-2 text-xs font-medium uppercase tracking-wide text-ink-muted md:grid">
              <span>Bill</span>
              <span>Customer</span>
              <span>Items</span>
              <span>Payment</span>
              <span>Date</span>
              <span className="text-right">Amount</span>
            </div>
            <ul className="divide-y divide-line/70">
              {bills.map((bill) => (
                <li key={bill._id} className="relative">
                  <div className="grid grid-cols-1 gap-2 px-4 py-3.5 md:grid-cols-[1.1fr_1.2fr_0.7fr_0.9fr_1.1fr_auto] md:items-center md:gap-2 md:px-5">
                    <Link
                      to={`/invoice/${bill._id}`}
                      className="text-sm font-semibold text-forest hover:underline"
                    >
                      #{bill.invoiceNumber}
                    </Link>
                    <p className="truncate text-sm text-ink">
                      {bill.customerName || "Walk-in"}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {bill.itemCount} items
                    </p>
                    <span
                      className={cn(
                        "inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium",
                        paymentTone(bill.paymentMethod),
                      )}
                    >
                      {paymentLabel(bill.paymentMethod)}
                    </span>
                    <p className="text-sm text-ink-muted">
                      {formatBillDateTime(bill.completedAt)}
                    </p>
                    <div className="flex items-center justify-between gap-2 md:justify-end">
                      <p className="text-sm font-semibold text-ink">
                        {formatINR(bill.total)}
                      </p>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-ink-muted hover:bg-paper-2"
                        onClick={() =>
                          setMenuId(menuId === bill._id ? null : bill._id)
                        }
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </div>
                  </div>
                  {menuId === bill._id ? (
                    <div
                      ref={menuRef}
                      className="absolute right-4 z-20 mt-[-8px] w-40 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-soft"
                    >
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
                        onClick={() => navigate(`/invoice/${bill._id}`)}
                      >
                        Open invoice
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
            {billsData && billsData.total > PAGE_SIZE ? (
              <div className="border-t border-line/70 px-4 py-3">
                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={billsData.total}
                  onPageChange={setPage}
                />
              </div>
            ) : null}
          </>
        )}
      </Surface>
    </div>
  );
}

function InventoryTab({ data }: { data: AnalyticsResponse }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2">
        <Surface className="p-4">
          <p className="text-xs text-ink-muted">Low / Out of Stock</p>
          <p className="mt-1 font-display text-3xl font-semibold text-orange-700">
            {data.quickStats.lowStockCount}
          </p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs text-ink-muted">Pending Purchases</p>
          <p className="mt-1 font-display text-3xl font-semibold text-ink">
            {data.quickStats.pendingPurchasesCount}
          </p>
        </Surface>
      </section>
      <Surface padded={false} className="overflow-hidden">
        <div className="border-b border-line/70 px-5 py-4">
          <h3 className="text-base font-semibold text-ink">Stock Status</h3>
        </div>
        {data.stockStatus.length === 0 ? (
          <EmptyState
            icon={<Package className="size-7" />}
            title="No tracked stock"
            description="Products pe stock tracking on karo."
          />
        ) : (
          <ul className="divide-y divide-line/60">
            {data.stockStatus.map((item) => {
              const badge = stockBadge(item.status);
              return (
                <li
                  key={item.productId}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  <ProductAvatar name={item.name} imageUrl={item.imageUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink">{item.name}</p>
                    <p className="text-xs text-ink-muted">Stock: {item.stock}</p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      badge.className,
                    )}
                  >
                    {badge.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>
      <Link
        to="/inventory"
        className="inline-flex text-sm font-medium text-forest hover:underline"
      >
        Open Inventory →
      </Link>
    </div>
  );
}

function CustomersTab({ data }: { data: AnalyticsResponse }) {
  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2">
        <Surface className="p-4">
          <p className="text-xs text-ink-muted">Customers in period</p>
          <p className="mt-1 font-display text-3xl font-semibold">
            {data.kpis.customersCount}
          </p>
          <p
            className={cn(
              "mt-1 text-xs font-medium",
              (data.kpis.customersChangePct ?? 0) >= 0
                ? "text-success"
                : "text-danger",
            )}
          >
            {changeLabel(data.kpis.customersChangePct)}
          </p>
        </Surface>
        <Surface className="p-4">
          <p className="text-xs text-ink-muted">Avg. Order Value</p>
          <p className="mt-1 font-display text-3xl font-semibold">
            {formatINR(data.kpis.avgBill)}
          </p>
        </Surface>
      </section>
      <Surface className="p-5">
        <p className="text-sm text-ink-muted">
          Customer-wise deep insights (buying clock, outstanding aging) next
          phases mein aaenge. Abhi customers list dekho.
        </p>
        <Link
          to="/customers"
          className="mt-3 inline-flex text-sm font-medium text-forest hover:underline"
        >
          Open Customers →
        </Link>
      </Surface>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  iconClass,
  label,
  value,
  change,
}: {
  icon: typeof Wallet;
  iconClass: string;
  label: string;
  value: string;
  change: number | null;
}) {
  return (
    <Surface className="space-y-3 p-4 sm:p-5">
      <span
        className={cn(
          "inline-flex size-10 items-center justify-center rounded-xl",
          iconClass,
        )}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          {value}
        </p>
      </div>
      <p
        className={cn(
          "text-xs font-semibold",
          change === null
            ? "text-ink-muted"
            : change >= 0
              ? "text-success"
              : "text-danger",
        )}
      >
        {changeLabel(change)}
      </p>
    </Surface>
  );
}

function QuickStat({
  icon: Icon,
  iconClass,
  label,
  value,
  valueClass,
}: {
  icon: typeof Wallet;
  iconClass: string;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span
        className={cn(
          "inline-flex size-9 shrink-0 items-center justify-center rounded-xl",
          iconClass,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-muted">{label}</p>
        <p className={cn("truncate text-sm font-semibold text-ink", valueClass)}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ProductAvatar({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className="size-9 shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-paper-2 text-xs font-semibold text-ink-muted">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function SalesOverviewChart({
  daily,
  maxSales,
}: {
  daily: AnalyticsResponse["daily"];
  maxSales: number;
}) {
  if (daily.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-ink-muted">
        Is period mein sales data nahi.
      </p>
    );
  }

  /** Fixed per-day slot — bars never shrink; long ranges scroll inside. */
  const SLOT = 72;
  const BAR_W = 44;
  const padL = 16;
  const padR = 16;
  const padT = 28;
  const padB = 32;
  const height = 220;
  const chartH = height - padT - padB;
  const width = padL + padR + daily.length * SLOT;

  const points = daily.map((day, i) => {
    const cx = padL + SLOT * i + SLOT / 2;
    const barH =
      day.salesTotal > 0
        ? Math.max(10, (day.salesTotal / maxSales) * chartH)
        : 0;
    const barY = padT + chartH - barH;
    return { ...day, cx, barH, barY };
  });

  return (
    <div className="min-w-0 w-full overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block shrink-0"
        role="img"
        aria-label="Sales trend chart"
      >
        {points.map((p) => {
          const barX = p.cx - BAR_W / 2;
          const barY = p.barH > 0 ? p.barY : padT + chartH - 4;
          const barH = p.barH > 0 ? p.barH : 4;
          const topR = Math.min(12, BAR_W / 2);
          // Rounded top only (flat bottom) — image 1 style
          const d = [
            `M ${barX} ${barY + barH}`,
            `L ${barX} ${barY + topR}`,
            `Q ${barX} ${barY} ${barX + topR} ${barY}`,
            `L ${barX + BAR_W - topR} ${barY}`,
            `Q ${barX + BAR_W} ${barY} ${barX + BAR_W} ${barY + topR}`,
            `L ${barX + BAR_W} ${barY + barH}`,
            "Z",
          ].join(" ");

          return (
            <g key={p.date}>
              {p.salesTotal > 0 ? (
                <text
                  x={p.cx}
                  y={p.barY - 10}
                  textAnchor="middle"
                  fill="#374151"
                  fontSize="12"
                  fontWeight="600"
                >
                  {formatINR(p.salesTotal)}
                </text>
              ) : null}
              <path
                d={d}
                fill="#0d3d2a"
                opacity={p.barH > 0 ? 1 : 0.18}
              >
                <title>{`${p.label}: ${formatINR(p.salesTotal)} · ${p.billsCount} bills`}</title>
              </path>
              <text
                x={p.cx}
                y={height - 10}
                textAnchor="middle"
                fill="#6b7280"
                fontSize="12"
                fontWeight="500"
              >
                {p.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CategoryDonut({
  slices,
  total,
}: {
  slices: Array<{ name: string; revenue: number; pct: number }>;
  total: number;
}) {
  const size = 168;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const revenueTotal = slices.reduce((s, x) => s + x.revenue, 0);

  if (slices.length === 0) {
    return (
      <div className="relative flex size-[168px] shrink-0 items-center justify-center">
        <div className="absolute inset-0 rounded-full border-[28px] border-paper-2" />
        <div className="text-center">
          <p className="text-[11px] text-ink-muted">Total Sales</p>
          <p className="text-sm font-semibold text-ink">{formatINR(total)}</p>
        </div>
      </div>
    );
  }

  let offset = 0;

  return (
    <div className="relative size-[168px] shrink-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e8ecef"
          strokeWidth={stroke}
        />
        {slices.map((slice, i) => {
          const isLast = i === slices.length - 1;
          // Use raw revenue share (not rounded pct) so the ring closes fully.
          const len = isLast
            ? Math.max(0, circumference - offset)
            : revenueTotal > 0
              ? (slice.revenue / revenueTotal) * circumference
              : 0;
          const el = (
            <circle
              key={slice.name}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${len} ${circumference}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[11px] text-ink-muted">Total Sales</p>
        <p className="text-sm font-semibold text-ink">{formatINR(total)}</p>
      </div>
    </div>
  );
}

