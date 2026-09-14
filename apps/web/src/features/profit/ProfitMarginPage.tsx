import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Calculator,
  CheckCircle2,
  Info,
  IndianRupee,
  Plus,
  Search,
  TrendingUp,
  X,
} from "lucide-react";
import {
  AppPageHeader,
  Button,
  EmptyState,
  Input,
  PageLoader,
  Surface,
} from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { AddProductDialog } from "@/features/products/AddProductDialog";
import { categoryArtFor } from "@/features/products/categoryArt";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";

type RangePreset = "today" | "week" | "month";

type ProfitProduct = {
  productId: string;
  name: string;
  category: string;
  imageUrl: string | null;
  costPrice: number | null;
  sellingPrice: number;
  currentSellingPrice: number;
  marginPerUnit: number | null;
  marginPct: number | null;
  unitsSold: number;
  totalProfit: number | null;
  stock: number | null;
  suggestedPrice: number | null;
  suggestedMarginPct: number;
};

type ProfitMarginResponse = {
  range: { from: string; to: string; preset: string };
  kpis: {
    totalRevenue: number;
    totalCost: number;
    totalProfit: number;
    averageMarginPct: number | null;
  };
  monthlyGoal: {
    current: number;
    target: number;
    projectedMonthEnd: number;
  };
  byCategory: Array<{ name: string; profit: number; pct: number }>;
  topProfitMakers: Array<{
    productId: string;
    name: string;
    marginPct: number | null;
    totalProfit: number | null;
    imageUrl: string | null;
  }>;
  alerts: Array<{
    productId: string;
    name: string;
    marginPct: number;
    costPrice: number;
    sellingPrice: number;
    suggestedPrice: number;
    suggestedMarginPct: number;
    imageUrl: string | null;
  }>;
  products: ProfitProduct[];
};

type SortKey =
  | "margin-asc"
  | "margin-desc"
  | "profit-desc"
  | "units-desc"
  | "name-asc";

const CATEGORY_COLORS = [
  "#f2b705",
  "#f97316",
  "#22c55e",
  "#38bdf8",
  "#3b82f6",
  "#94a3b8",
];

function ProductThumb({
  name,
  imageUrl,
}: {
  name: string;
  imageUrl: string | null;
}) {
  const art = categoryArtFor(name);
  return (
    <span className="relative flex size-10 shrink-0 overflow-hidden rounded-xl bg-slate-100">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        <span
          className="flex size-full items-center justify-center text-lg"
          style={{ background: art.bg }}
          aria-hidden
        >
          {art.emoji}
        </span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

function ProfitDonut({
  segments,
}: {
  segments: Array<{ name: string; pct: number; color: string }>;
}) {
  const size = 148;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 4;
  const usable = segments.filter((s) => s.pct > 0);
  const sum = usable.reduce((s, x) => s + x.pct, 0) || 1;
  let offset = 0;

  return (
    <div className="relative mx-auto size-[148px]">
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
        {usable.map((seg, i) => {
          const isLast = i === usable.length - 1;
          const raw = (seg.pct / sum) * circumference;
          const len = Math.max(
            0,
            isLast ? circumference - offset - gap : raw - gap,
          );
          const el = (
            <circle
              key={seg.name}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeLinecap="butt"
              strokeDasharray={`${len} ${circumference}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len + gap;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[11px] text-ink-muted">Profit</p>
        <p className="font-display text-sm font-semibold text-ink">by category</p>
      </div>
    </div>
  );
}

export function ProfitMarginPage() {
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const roleLabel =
    activeShop?.role === "OWNER"
      ? "Owner"
      : activeShop?.role
        ? activeShop.role.charAt(0) + activeShop.role.slice(1).toLowerCase()
        : "Team";

  const [range, setRange] = useState<RangePreset>("today");
  const [data, setData] = useState<ProfitMarginResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("margin-asc");
  const [ownerView, setOwnerView] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [adjustPrice, setAdjustPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [simCost, setSimCost] = useState("");
  const [simSell, setSimSell] = useState("");

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api<ProfitMarginResponse>(
        `/api/shops/${shopId}/reports/profit-margin?range=${range}`,
      );
      setData(res);
    } catch (err) {
      setData(null);
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Profit data load nahi hui",
      );
    } finally {
      setLoading(false);
    }
  }, [shopId, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const list = data?.products ?? [];
    const query = q.trim().toLowerCase();
    const filtered = query
      ? list.filter(
          (p) =>
            p.name.toLowerCase().includes(query) ||
            p.category.toLowerCase().includes(query),
        )
      : list;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "name-asc") return a.name.localeCompare(b.name);
      if (sortKey === "units-desc") return b.unitsSold - a.unitsSold;
      if (sortKey === "profit-desc")
        return (b.totalProfit ?? -Infinity) - (a.totalProfit ?? -Infinity);
      if (sortKey === "margin-desc")
        return (b.marginPerUnit ?? -Infinity) - (a.marginPerUnit ?? -Infinity);
      return (a.marginPerUnit ?? Infinity) - (b.marginPerUnit ?? Infinity);
    });
    return sorted;
  }, [data?.products, q, sortKey]);

  const categorySegments = useMemo(
    () =>
      (data?.byCategory ?? []).map((c, i) => ({
        ...c,
        color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]!,
      })),
    [data?.byCategory],
  );

  const goalPct = data
    ? Math.min(100, (data.monthlyGoal.current / data.monthlyGoal.target) * 100)
    : 0;

  const simCostN = Number(simCost);
  const simSellN = Number(simSell);
  const simMargin =
    Number.isFinite(simCostN) &&
    Number.isFinite(simSellN) &&
    simSellN > 0 &&
    simCostN >= 0
      ? ((simSellN - simCostN) / simSellN) * 100
      : null;

  const adjusting = rows.find((r) => r.productId === adjustId) ?? null;

  async function saveAdjust() {
    if (!shopId || !adjustId) return;
    const price = Number(adjustPrice);
    if (!Number.isFinite(price) || price < 0) {
      setError("Valid selling price daalo");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/shops/${shopId}/products/${adjustId}`, {
        method: "PATCH",
        body: JSON.stringify({ sellingPrice: price }),
      });
      setAdjustId(null);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Price update fail hui",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!shopId) return <PageLoader />;

  return (
    <div className="mx-auto w-full max-w-7xl pb-4">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <AppPageHeader
            title="Profit Margin"
            subtitle="Customers ko sirf selling price dikhta hai — aapko real munafa."
            action={
              <div className="hidden h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-soft md:inline-flex">
                <span className="flex size-7 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-semibold text-white">
                  {(activeShop?.name ?? "S").slice(0, 1).toUpperCase()}
                </span>
                <span className="max-w-[140px] truncate font-medium">
                  {activeShop?.name ?? "Shop"}, {roleLabel}
                </span>
              </div>
            }
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <IndianRupee className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
                  Profit Margin
                </h2>
                <p className="text-xs text-ink-muted sm:text-sm">
                  Har product ka cost price, selling price aur munafa.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                role="switch"
                aria-checked={ownerView}
                aria-label="Owner view"
                onClick={() => setOwnerView((v) => !v)}
                className="inline-flex h-10 items-center gap-2.5 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink shadow-soft"
              >
                <span>Owner view</span>
                <span
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
                    ownerView ? "bg-emerald-500" : "bg-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "size-5 rounded-full bg-white shadow-sm transition-transform",
                      ownerView ? "translate-x-5" : "translate-x-0",
                    )}
                  />
                </span>
              </button>
              <Button
                variant="secondary"
                leftIcon={<Calculator className="size-4" />}
                onClick={() => setSimOpen(true)}
              >
                Price simulator
              </Button>
              <Button
                variant="primary"
                leftIcon={<Plus className="size-4" />}
                onClick={() => setDialogOpen(true)}
              >
                Add product
              </Button>
            </div>
          </div>

          <div className="inline-flex rounded-xl border border-line bg-white p-1 shadow-soft">
            {(
              [
                { id: "today", label: "Today" },
                { id: "week", label: "This week" },
                { id: "month", label: "This month" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setRange(p.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  range === p.id
                    ? "bg-forest text-white"
                    : "text-ink-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-3 rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-950">
            <Info className="mt-0.5 size-4 shrink-0 text-sky-600" />
            <p>
              Is page pe cost aur selling dono dikhte hain. Customer bill pe sirf
              selling price dekhta hai — aapko margin aur real profit milta hai,
              dukan band karte waqt alag se hisaab nahi karna padta.
            </p>
          </div>

          {error ? (
            <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          {loading && !data ? (
            <PageLoader />
          ) : data ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Surface className="space-y-1 p-4">
                  <p className="text-sm text-ink-muted">Total revenue</p>
                  <p className="font-display text-3xl font-semibold text-ink">
                    {formatINR(data.kpis.totalRevenue)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Selling price × units sold
                  </p>
                </Surface>
                <Surface className="space-y-1 p-4">
                  <p className="text-sm text-ink-muted">Total cost</p>
                  <p className="font-display text-3xl font-semibold text-ink">
                    {ownerView ? formatINR(data.kpis.totalCost) : "••••"}
                  </p>
                  <p className="text-xs text-ink-muted">
                    Cost price × units sold
                  </p>
                </Surface>
                <Surface className="space-y-1 p-4">
                  <p className="text-sm text-ink-muted">Total profit</p>
                  <p className="font-display text-3xl font-semibold text-emerald-700">
                    {ownerView ? formatINR(data.kpis.totalProfit) : "••••"}
                  </p>
                  <p className="text-xs text-ink-muted">Revenue − cost</p>
                </Surface>
                <Surface className="space-y-1 p-4">
                  <p className="text-sm text-ink-muted">Average margin</p>
                  <p className="font-display text-3xl font-semibold text-ink">
                    {ownerView
                      ? data.kpis.averageMarginPct !== null
                        ? `${data.kpis.averageMarginPct.toFixed(1)}%`
                        : "—"
                      : "••••"}
                  </p>
                  <p className="text-xs text-ink-muted">Weighted by revenue</p>
                </Surface>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Search products..."
                    className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-sm shadow-soft outline-none ring-forest/30 focus:ring-2"
                  />
                </div>
                <select
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  className="h-11 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink shadow-soft outline-none"
                >
                  <option value="margin-asc">Margin ₹: Low to High</option>
                  <option value="margin-desc">Margin ₹: High to Low</option>
                  <option value="profit-desc">Total profit: High to Low</option>
                  <option value="units-desc">Units sold: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                </select>
              </div>

              <Surface className="overflow-hidden p-0">
                {rows.length === 0 ? (
                  <EmptyState
                    title="Is period mein koi sale nahi"
                    description="Jab bill complete hogi, yahan product-wise profit dikhega."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-line bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                          <th className="px-4 py-3">Product</th>
                          {ownerView ? (
                            <th className="px-3 py-3">Cost price</th>
                          ) : null}
                          <th className="px-3 py-3">Selling price</th>
                          {ownerView ? (
                            <th className="px-3 py-3">Margin</th>
                          ) : null}
                          <th className="px-3 py-3">Units sold</th>
                          {ownerView ? (
                            <th className="px-3 py-3">Total profit</th>
                          ) : null}
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.productId}
                            className="border-b border-line last:border-0"
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <ProductThumb
                                  name={row.name}
                                  imageUrl={row.imageUrl}
                                />
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-ink">
                                    {row.name}
                                  </p>
                                  <p className="text-xs text-ink-muted">
                                    {row.category}
                                  </p>
                                </div>
                              </div>
                            </td>
                            {ownerView ? (
                              <td className="px-3 py-3 text-ink">
                                {row.costPrice !== null
                                  ? formatINR(row.costPrice)
                                  : "—"}
                              </td>
                            ) : null}
                            <td className="px-3 py-3 font-medium text-ink">
                              {formatINR(row.currentSellingPrice)}
                            </td>
                            {ownerView ? (
                              <td className="px-3 py-3 font-medium text-ink">
                                {row.marginPerUnit !== null
                                  ? formatINR(row.marginPerUnit)
                                  : "—"}
                              </td>
                            ) : null}
                            <td className="px-3 py-3 text-ink">
                              {row.unitsSold}
                            </td>
                            {ownerView ? (
                              <td className="px-3 py-3 font-semibold text-ink">
                                {row.totalProfit !== null
                                  ? formatINR(row.totalProfit)
                                  : "—"}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:bg-slate-50"
                                onClick={() => {
                                  setAdjustId(row.productId);
                                  setAdjustPrice(
                                    String(row.currentSellingPrice),
                                  );
                                }}
                              >
                                Adjust price
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Surface>
            </>
          ) : null}
        </div>

        <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-4 xl:w-[320px]">
          {ownerView && data?.alerts.length ? (
            <Surface className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="size-4 text-rose-600" />
                <h3 className="font-display text-base font-semibold text-ink">
                  Low margin review
                </h3>
              </div>
              {data.alerts.map((alert) => (
                <div
                  key={alert.productId}
                  className="rounded-xl border border-line bg-white p-3"
                >
                  <div className="flex items-start gap-2">
                    <ProductThumb
                      name={alert.name}
                      imageUrl={alert.imageUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {alert.name}
                      </p>
                      <p className="text-xs font-medium text-rose-600">
                        Sirf {alert.marginPct.toFixed(1)}% margin
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg bg-ink px-2.5 py-1 text-[11px] font-semibold text-white"
                      onClick={() => {
                        setAdjustId(alert.productId);
                        setAdjustPrice(String(alert.sellingPrice));
                      }}
                    >
                      Review
                    </button>
                  </div>
                </div>
              ))}
            </Surface>
          ) : null}

          {ownerView && data ? (
            <Surface className="space-y-3 p-4">
              <h3 className="font-display text-base font-semibold text-ink">
                Monthly profit goal
              </h3>
              <p className="text-sm text-ink-muted">
                <span className="font-semibold text-ink">
                  {formatINR(data.monthlyGoal.current)}
                </span>{" "}
                of {formatINR(data.monthlyGoal.target)}
              </p>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${goalPct}%` }}
                />
              </div>
              <div className="flex gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <p>
                  Is raftar se month end tak lagbhag{" "}
                  <span className="font-semibold">
                    {formatINR(data.monthlyGoal.projectedMonthEnd)}
                  </span>{" "}
                  tak pahunch sakte ho.
                </p>
              </div>
            </Surface>
          ) : null}

          {ownerView && categorySegments.length > 0 ? (
            <Surface className="space-y-3 p-4">
              <h3 className="font-display text-base font-semibold text-ink">
                Profit by category
              </h3>
              <ProfitDonut segments={categorySegments} />
              <ul className="space-y-2">
                {categorySegments.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: c.color }}
                      />
                      <span className="truncate text-ink">{c.name}</span>
                    </span>
                    <span className="shrink-0 font-medium text-ink-muted">
                      {c.pct.toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}

          {ownerView && data?.topProfitMakers.length ? (
            <Surface className="space-y-3 p-4">
              <h3 className="font-display text-base font-semibold text-ink">
                Top profit makers
              </h3>
              <ul className="space-y-3">
                {data.topProfitMakers.map((item) => (
                  <li key={item.productId} className="flex items-center gap-3">
                    <ProductThumb
                      name={item.name}
                      imageUrl={item.imageUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {item.name}
                      </p>
                      <p className="text-xs text-ink-muted">
                        {item.marginPct !== null
                          ? `${item.marginPct.toFixed(1)}% margin`
                          : "—"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-ink">
                      {item.totalProfit !== null
                        ? formatINR(item.totalProfit)
                        : "—"}
                    </p>
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}
        </aside>
      </div>

      {adjusting ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Surface className="w-full max-w-md space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">
                  Adjust price
                </h3>
                <p className="text-sm text-ink-muted">{adjusting.name}</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-ink-muted hover:bg-slate-100"
                onClick={() => setAdjustId(null)}
              >
                <X className="size-5" />
              </button>
            </div>
            {ownerView && adjusting.costPrice !== null ? (
              <p className="text-xs text-ink-muted">
                Cost: {formatINR(adjusting.costPrice)}
                {adjusting.suggestedPrice !== null
                  ? ` · ~20% ke liye ${formatINR(adjusting.suggestedPrice)}`
                  : ""}
              </p>
            ) : null}
            <Input
              label="New selling price"
              type="number"
              min={0}
              step="0.01"
              value={adjustPrice}
              onChange={(e) => setAdjustPrice(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setAdjustId(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={saving}
                onClick={() => void saveAdjust()}
              >
                Save price
              </Button>
            </div>
          </Surface>
        </div>
      ) : null}

      {simOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <Surface className="w-full max-w-md space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-semibold text-ink">
                  Price simulator
                </h3>
                <p className="text-sm text-ink-muted">
                  Cost aur selling daalo — margin turant dikhega.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-ink-muted hover:bg-slate-100"
                onClick={() => setSimOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Cost price"
                type="number"
                min={0}
                value={simCost}
                onChange={(e) => setSimCost(e.target.value)}
              />
              <Input
                label="Selling price"
                type="number"
                min={0}
                value={simSell}
                onChange={(e) => setSimSell(e.target.value)}
              />
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <p className="text-sm text-ink-muted">Margin</p>
              <p className="font-display text-2xl font-semibold text-ink">
                {simMargin !== null ? `${simMargin.toFixed(1)}%` : "—"}
              </p>
              {simMargin !== null ? (
                <p className="mt-1 text-xs text-ink-muted">
                  Profit / unit: {formatINR(simSellN - simCostN)}
                </p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setSimOpen(false)}>
                Done
              </Button>
            </div>
          </Surface>
        </div>
      ) : null}

      <AddProductDialog
        shopId={shopId}
        open={dialogOpen}
        initialName=""
        onClose={() => setDialogOpen(false)}
        onCreated={() => void load()}
      />
    </div>
  );
}
