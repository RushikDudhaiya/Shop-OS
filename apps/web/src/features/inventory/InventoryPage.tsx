import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  Clock,
  History,
  Package,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { inferProductCategoryGroup } from "@shop-os/shared";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  PageLoader,
  Pagination,
  Surface,
} from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { AddProductDialog } from "@/features/products/AddProductDialog";
import { categoryArtFor } from "@/features/products/categoryArt";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";

type StockStatus = "ok" | "low" | "out";

type StockItem = {
  productId: string;
  name: string;
  availableStock: number;
  minStock: number;
  isLow: boolean;
  status: StockStatus;
  unit: string;
  sellingPrice?: number;
  purchasePrice?: number | null;
  imageUrl?: string | null;
  updatedAt?: string | null;
};

type InventorySummary = {
  totalTracked: number;
  lowStock: number;
  outOfStock: number;
  notTracked: number;
};

type SortKey = "name-asc" | "name-desc" | "stock-asc" | "stock-desc" | "value-desc";

type TxRow = {
  _id: string;
  type: string;
  quantityDelta: number;
  note: string | null;
  createdAt?: string;
};

type CategoryOption = { _id: string; name: string };

const PAGE_SIZE = 10;

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

function formatAgo(iso?: string | null): string {
  if (!iso) return "No movement";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "No movement";
  const mins = Math.round((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function statusLabel(status: StockStatus) {
  if (status === "out") return "Out of stock";
  if (status === "low") return "Low stock";
  return "In stock";
}

function statusTone(status: StockStatus): "success" | "warn" | "danger" {
  if (status === "out") return "danger";
  if (status === "low") return "warn";
  return "success";
}

function itemCategory(item: StockItem) {
  return inferProductCategoryGroup(item.name, item.unit);
}

function stockValue(item: StockItem) {
  const unitCost = item.purchasePrice ?? item.sellingPrice ?? 0;
  return Math.max(0, item.availableStock) * unitCost;
}

function ProductThumb({ item }: { item: StockItem }) {
  const art = categoryArtFor(item.name, item.unit);
  return (
    <div
      className="relative size-10 shrink-0 overflow-hidden rounded-xl"
      style={{ background: art.bg }}
    >
      {item.imageUrl ? (
        <img
          src={item.imageUrl}
          alt=""
          className="size-full object-contain p-1"
          loading="lazy"
        />
      ) : (
        <span className="flex size-full items-center justify-center text-lg">
          {art.emoji}
        </span>
      )}
    </div>
  );
}

function StockStatusDonut({
  inStock,
  low,
  out,
  total,
}: {
  inStock: number;
  low: number;
  out: number;
  total: number;
}) {
  const size = 148;
  const stroke = 22;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const gap = 5;
  const segments = [
    { value: inStock, color: "#0d3d2a" },
    { value: low, color: "#f2b705" },
    { value: out, color: "#c0392b" },
  ].filter((s) => s.value > 0);
  const sum = segments.reduce((s, x) => s + x.value, 0) || 1;
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
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const raw = (seg.value / sum) * circumference;
          const len = Math.max(
            0,
            isLast ? circumference - offset - gap : raw - gap,
          );
          const el = (
            <circle
              key={seg.color}
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
        <p className="font-display text-2xl font-semibold text-ink">{total}</p>
        <p className="text-[11px] text-ink-muted">SKUs</p>
      </div>
    </div>
  );
}

export function InventoryPage() {
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const roleLabel =
    activeShop?.role === "OWNER"
      ? "Owner"
      : activeShop?.role
        ? activeShop.role.charAt(0) + activeShop.role.slice(1).toLowerCase()
        : "Team";
  const now = useMemo(() => new Date(), []);

  const [items, setItems] = useState<StockItem[]>([]);
  const [, setSummary] = useState<InventorySummary | null>(null);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out" | "ok">(
    "all",
  );
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");
  const [page, setPage] = useState(1);
  const [adjustFor, setAdjustFor] = useState<StockItem | null>(null);
  const [historyFor, setHistoryFor] = useState<StockItem | null>(null);
  const [history, setHistory] = useState<TxRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [inv, cats] = await Promise.all([
        api<{ items: StockItem[]; summary: InventorySummary }>(
          `/api/shops/${shopId}/inventory`,
        ),
        api<{ categories: CategoryOption[] }>(
          `/api/shops/${shopId}/categories`,
        ).catch(() => ({ categories: [] as CategoryOption[] })),
      ]);
      setItems(inv.items);
      setSummary(inv.summary);
      setCategories(cats.categories);
    } catch (err) {
      setItems([]);
      setSummary(null);
      setLoadError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Inventory load nahi hui",
      );
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [q, categoryFilter, stockFilter, sortKey]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const c = itemCategory(item);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [items]);

  const stats = useMemo(() => {
    const inStock = items.filter((i) => i.status === "ok").length;
    const low = items.filter((i) => i.status === "low").length;
    const out = items.filter((i) => i.status === "out").length;
    const totalValue = items.reduce((s, i) => s + stockValue(i), 0);
    return {
      totalValue,
      totalSkus: items.length,
      categoryCount: categoryCounts.length || categories.length,
      inStock,
      low,
      out,
    };
  }, [items, categoryCounts.length, categories.length]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = items.filter((i) => {
      if (stockFilter === "low" && i.status !== "low") return false;
      if (stockFilter === "out" && i.status !== "out") return false;
      if (stockFilter === "ok" && i.status !== "ok") return false;
      if (categoryFilter !== "All" && itemCategory(i) !== categoryFilter) {
        return false;
      }
      if (needle && !i.name.toLowerCase().includes(needle)) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (sortKey === "name-asc") return a.name.localeCompare(b.name);
      if (sortKey === "name-desc") return b.name.localeCompare(a.name);
      if (sortKey === "stock-asc") return a.availableStock - b.availableStock;
      if (sortKey === "stock-desc") return b.availableStock - a.availableStock;
      return stockValue(b) - stockValue(a);
    });
    return list;
  }, [items, q, stockFilter, categoryFilter, sortKey]);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const lowAlerts = useMemo(
    () =>
      items
        .filter((i) => i.status === "low" || i.status === "out")
        .slice(0, 6),
    [items],
  );

  const recentMovements = useMemo(
    () =>
      [...items]
        .filter((i) => i.updatedAt)
        .sort(
          (a, b) =>
            new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime(),
        )
        .slice(0, 5),
    [items],
  );

  async function openHistory(item: StockItem) {
    if (!shopId) return;
    setHistoryFor(item);
    setHistoryLoading(true);
    try {
      const data = await api<{ transactions: TxRow[] }>(
        `/api/shops/${shopId}/inventory/${item.productId}/transactions`,
      );
      setHistory(data.transactions);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function onAdjust(e: FormEvent) {
    e.preventDefault();
    if (!shopId || !adjustFor) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shops/${shopId}/inventory/adjust`, {
        method: "POST",
        body: JSON.stringify({
          productId: adjustFor.productId,
          type:
            direction === "in"
              ? "MANUAL_ADJUSTMENT_IN"
              : "MANUAL_ADJUSTMENT_OUT",
          quantityDelta: Number(qty),
          note: note || undefined,
        }),
      });
      setAdjustFor(null);
      setQty("1");
      setNote("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Adjust fail",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    if (!shopId || !newCategoryName.trim()) return;
    setCategoryBusy(true);
    setCategoryError(null);
    try {
      await api(`/api/shops/${shopId}/categories`, {
        method: "POST",
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      setNewCategoryName("");
      setAddCategoryOpen(false);
      await load();
    } catch (err) {
      setCategoryError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Category create fail",
      );
    } finally {
      setCategoryBusy(false);
    }
  }

  if (!shopId) return <PageLoader />;

  const greeting = greetingForHour(now.getHours());

  return (
    <div className="mx-auto w-full max-w-7xl pb-4">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {greeting}, {roleLabel}{" "}
                <span aria-hidden>👋</span>
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                Stock levels, movements aur restocking — sab ek jagah.
              </p>
            </div>
            <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-soft">
              <CalendarDays className="size-4 text-forest" />
              {formatDashboardDate(now)}
            </div>
          </header>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <Boxes className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
                  Inventory
                </h2>
                <p className="text-sm text-ink-muted">
                  Har product ka stock track karein aur restock karein.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                leftIcon={<Plus className="size-4" />}
                onClick={() => {
                  setCategoryError(null);
                  setAddCategoryOpen(true);
                }}
              >
                Add category
              </Button>
              <Button
                variant="primary"
                leftIcon={<Plus className="size-4" />}
                onClick={() => setAddProductOpen(true)}
              >
                Add product
              </Button>
            </div>
          </div>

          {loading ? (
            <PageLoader />
          ) : loadError ? (
            <EmptyState
              icon={<Package className="size-7" />}
              title="Inventory load fail"
              description={loadError}
              actionLabel="Retry"
              onAction={() => void load()}
            />
          ) : (
            <>
              <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Surface className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                      <ShoppingCart className="size-4" />
                    </span>
                    <p className="text-sm text-ink-muted">Total stock value</p>
                  </div>
                  <p className="font-display text-3xl font-semibold text-ink">
                    {formatINR(stats.totalValue)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {stats.totalSkus} SKUs tracked
                  </p>
                </Surface>

                <Surface className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <ShoppingBag className="size-4" />
                    </span>
                    <p className="text-sm text-ink-muted">Total SKUs</p>
                  </div>
                  <p className="font-display text-3xl font-semibold text-ink">
                    {stats.totalSkus}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {stats.categoryCount} categories
                  </p>
                </Surface>

                <Surface className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <AlertTriangle className="size-4" />
                    </span>
                    <p className="text-sm text-ink-muted">Low stock</p>
                  </div>
                  <p className="font-display text-3xl font-semibold text-ink">
                    {stats.low}
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-forest hover:underline"
                    onClick={() => {
                      setStockFilter("low");
                      setCategoryFilter("All");
                    }}
                  >
                    View →
                  </button>
                </Surface>

                <Surface className="space-y-2 p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 items-center justify-center rounded-xl bg-red-50 text-red-700">
                      <Clock className="size-4" />
                    </span>
                    <p className="text-sm text-ink-muted">Out of stock</p>
                  </div>
                  <p className="font-display text-3xl font-semibold text-ink">
                    {stats.out}
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-forest hover:underline"
                    onClick={() => {
                      setStockFilter("out");
                      setCategoryFilter("All");
                    }}
                  >
                    View →
                  </button>
                </Surface>
              </section>

              <section className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                  <input
                    className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-forest"
                    placeholder="Search products..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="Search inventory"
                  />
                </div>
                <select
                  className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink"
                  value={sortKey}
                  onChange={(e) => setSortKey(e.target.value as SortKey)}
                  aria-label="Sort inventory"
                >
                  <option value="name-asc">Sort by: Name (A–Z)</option>
                  <option value="name-desc">Sort by: Name (Z–A)</option>
                  <option value="stock-asc">Sort by: Stock (Low)</option>
                  <option value="stock-desc">Sort by: Stock (High)</option>
                  <option value="value-desc">Sort by: Stock value</option>
                </select>
              </section>

              <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
                <button
                  type="button"
                  onClick={() => {
                    setCategoryFilter("All");
                    setStockFilter("all");
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                    categoryFilter === "All" && stockFilter === "all"
                      ? "bg-[#1a1c2e] text-white shadow-soft"
                      : "border border-line bg-white text-ink-muted hover:bg-paper-2",
                  )}
                >
                  All ({stats.totalSkus})
                </button>
                {categoryCounts.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(c.name);
                      setStockFilter("all");
                    }}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                      categoryFilter === c.name
                        ? "bg-[#1a1c2e] text-white shadow-soft"
                        : "border border-line bg-white text-ink-muted hover:bg-paper-2",
                    )}
                  >
                    <span aria-hidden>
                      {categoryArtFor(c.name, "piece").emoji}
                    </span>
                    {c.name} ({c.count})
                  </button>
                ))}
                <button
                  type="button"
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-forest/30 bg-white px-3 py-1.5 text-sm font-semibold text-forest hover:bg-forest/5"
                  onClick={() => setAddCategoryOpen(true)}
                >
                  <Plus className="size-3.5" />
                  Add category
                </button>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={<Package className="size-7" />}
                  title={
                    q || categoryFilter !== "All" || stockFilter !== "all"
                      ? "Koi match nahi"
                      : "Tracked products nahi"
                  }
                  description="Products pe Track stock ON karo, ya filter badlo."
                  actionLabel="Add product"
                  onAction={() => setAddProductOpen(true)}
                />
              ) : (
                <>
                  <Surface
                    padded={false}
                    className="hidden overflow-hidden md:block"
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[860px] text-left text-sm">
                        <thead className="border-b border-line bg-paper-2/60 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                          <tr>
                            <th className="px-4 py-3">Product</th>
                            <th className="px-4 py-3">Current stock</th>
                            <th className="px-4 py-3">Reorder at</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Stock value</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedItems.map((item) => {
                            const cat = itemCategory(item);
                            return (
                              <tr
                                key={item.productId}
                                className="border-b border-line/70 last:border-0 hover:bg-paper-2/40"
                              >
                                <td className="px-4 py-3">
                                  <div className="flex min-w-0 items-center gap-3">
                                    <ProductThumb item={item} />
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold text-ink">
                                        {item.name}
                                      </p>
                                      <p className="mt-0.5 text-xs text-ink-muted">
                                        {cat}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-medium text-ink">
                                  {item.availableStock}
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-flex min-w-8 items-center justify-center rounded-lg bg-paper-2 px-2 py-1 text-xs font-semibold text-ink">
                                    {item.minStock || "—"}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <Badge tone={statusTone(item.status)}>
                                    {statusLabel(item.status)}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 font-medium text-ink">
                                  {formatINR(stockValue(item))}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-1.5">
                                    <button
                                      type="button"
                                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                      onClick={() => {
                                        setDirection("in");
                                        setAdjustFor(item);
                                        setError(null);
                                      }}
                                    >
                                      + Stock in
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex h-8 items-center gap-1 rounded-lg bg-red-50 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                      onClick={() => {
                                        setDirection("out");
                                        setAdjustFor(item);
                                        setError(null);
                                      }}
                                    >
                                      − Stock out
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex size-8 items-center justify-center rounded-lg border border-line text-ink-muted hover:bg-paper-2"
                                      aria-label="History"
                                      onClick={() => void openHistory(item)}
                                    >
                                      <History className="size-3.5" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={page}
                      pageSize={PAGE_SIZE}
                      total={filtered.length}
                      noun="products"
                      onPageChange={setPage}
                    />
                  </Surface>

                  <ul className="space-y-2 md:hidden">
                    {pagedItems.map((item) => (
                      <li key={item.productId}>
                        <Surface className="space-y-3 !p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-3">
                              <ProductThumb item={item} />
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-ink">
                                  {item.name}
                                </p>
                                <p className="text-xs text-ink-muted">
                                  {itemCategory(item)} · Stock{" "}
                                  {item.availableStock}
                                </p>
                              </div>
                            </div>
                            <Badge tone={statusTone(item.status)}>
                              {statusLabel(item.status)}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium text-ink">
                            {formatINR(stockValue(item))}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="inline-flex h-8 items-center rounded-lg bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700"
                              onClick={() => {
                                setDirection("in");
                                setAdjustFor(item);
                                setError(null);
                              }}
                            >
                              + Stock in
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 items-center rounded-lg bg-red-50 px-2.5 text-xs font-semibold text-red-700"
                              onClick={() => {
                                setDirection("out");
                                setAdjustFor(item);
                                setError(null);
                              }}
                            >
                              − Stock out
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-xs font-medium text-ink-muted"
                              onClick={() => void openHistory(item)}
                            >
                              History
                            </button>
                          </div>
                        </Surface>
                      </li>
                    ))}
                  </ul>
                  <Surface padded={false} className="overflow-hidden md:hidden">
                    <Pagination
                      page={page}
                      pageSize={PAGE_SIZE}
                      total={filtered.length}
                      noun="products"
                      onPageChange={setPage}
                    />
                  </Surface>
                </>
              )}
            </>
          )}
        </div>

        {!loading && !loadError ? (
          <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-4 xl:w-[300px]">
            <Surface className="space-y-3 p-4">
              <h3 className="text-sm font-semibold text-ink">Stock status</h3>
              <StockStatusDonut
                inStock={stats.inStock}
                low={stats.low}
                out={stats.out}
                total={stats.totalSkus}
              />
              <ul className="space-y-2 text-sm">
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-ink-muted">
                    <span className="size-2.5 rounded-full bg-[#0d3d2a]" />
                    In stock
                  </span>
                  <span className="font-semibold text-ink">{stats.inStock}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-ink-muted">
                    <span className="size-2.5 rounded-full bg-[#f2b705]" />
                    Low stock
                  </span>
                  <span className="font-semibold text-ink">{stats.low}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-ink-muted">
                    <span className="size-2.5 rounded-full bg-[#c0392b]" />
                    Out of stock
                  </span>
                  <span className="font-semibold text-ink">{stats.out}</span>
                </li>
              </ul>
            </Surface>

            <Surface className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">Categories</h3>
                <span className="text-xs text-ink-muted">
                  {stats.categoryCount} total
                </span>
              </div>
              <ul className="space-y-1.5">
                {categoryCounts.length === 0 ? (
                  <li className="text-sm text-ink-muted">No categories yet.</li>
                ) : (
                  categoryCounts.slice(0, 8).map((c) => (
                    <li
                      key={c.name}
                      className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-paper-2"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        onClick={() => {
                          setCategoryFilter(c.name);
                          setStockFilter("all");
                        }}
                      >
                        <span className="text-base" aria-hidden>
                          {categoryArtFor(c.name, "piece").emoji}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                          {c.name}
                        </span>
                        <span className="text-xs text-ink-muted">{c.count}</span>
                      </button>
                      <span className="inline-flex gap-0.5 text-ink-muted">
                        <span className="rounded-lg p-1 opacity-40" title="Edit coming soon">
                          <Pencil className="size-3.5" />
                        </span>
                        <span className="rounded-lg p-1 opacity-40" title="Delete coming soon">
                          <Trash2 className="size-3.5" />
                        </span>
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </Surface>

            <Surface className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">
                Low stock alerts
              </h3>
              {lowAlerts.length === 0 ? (
                <p className="text-sm text-ink-muted">Sab stock theek hai.</p>
              ) : (
                <ul className="space-y-2.5">
                  {lowAlerts.map((item) => (
                    <li
                      key={item.productId}
                      className="flex items-center gap-2.5"
                    >
                      <ProductThumb item={item} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {item.name}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {item.status === "out"
                            ? "Out of stock"
                            : `${item.availableStock} left`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg bg-forest px-2.5 py-1.5 text-xs font-semibold text-white"
                        onClick={() => {
                          setDirection("in");
                          setAdjustFor(item);
                          setError(null);
                        }}
                      >
                        Restock
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>

            <Surface className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">
                Recent movements
              </h3>
              {recentMovements.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Abhi tak koi movement nahi
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {recentMovements.map((item) => (
                    <li key={item.productId} className="flex items-center gap-2.5">
                      <ProductThumb item={item} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">
                          {item.name}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatAgo(item.updatedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-forest hover:underline"
                        onClick={() => void openHistory(item)}
                      >
                        View
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
          </aside>
        ) : null}
      </div>

      {adjustFor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setAdjustFor(null)}
        >
          <form
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void onAdjust(e)}
          >
            <h2 className="text-lg font-semibold">
              {direction === "in" ? "Stock in" : "Stock out"} — {adjustFor.name}
            </h2>
            <p className="text-sm text-ink-muted">
              Abhi: {adjustFor.availableStock} {adjustFor.unit}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={direction === "in" ? "primary" : "secondary"}
                onClick={() => setDirection("in")}
              >
                Stock in
              </Button>
              <Button
                type="button"
                variant={direction === "out" ? "primary" : "secondary"}
                onClick={() => setDirection("out")}
              >
                Stock out
              </Button>
            </div>
            <Input
              label="Quantity"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              required
            />
            <Input
              label="Note (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setAdjustFor(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" fullWidth loading={saving}>
                Save
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {historyFor ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setHistoryFor(null)}
        >
          <div
            className="flex max-h-[80dvh] w-full max-w-md flex-col rounded-2xl bg-white p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">
              History — {historyFor.name}
            </h2>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {historyLoading ? (
                <PageLoader />
              ) : history.length === 0 ? (
                <p className="text-sm text-ink-muted">Abhi koi movement nahi.</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((tx) => (
                    <li
                      key={tx._id}
                      className="rounded-xl bg-paper-2/80 px-3 py-2 text-sm"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{tx.type}</span>
                        <span
                          className={
                            tx.quantityDelta >= 0
                              ? "text-success"
                              : "text-danger"
                          }
                        >
                          {tx.quantityDelta >= 0 ? "+" : ""}
                          {tx.quantityDelta}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted">
                        {formatAgo(tx.createdAt)}
                        {tx.note ? ` · ${tx.note}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Button
              className="mt-4"
              variant="secondary"
              fullWidth
              onClick={() => setHistoryFor(null)}
            >
              Close
            </Button>
          </div>
        </div>
      ) : null}

      {addCategoryOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setAddCategoryOpen(false)}
        >
          <form
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void createCategory(e)}
          >
            <h2 className="text-lg font-semibold">Add category</h2>
            <Input
              label="Category name"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Snacks"
              required
            />
            {categoryError ? (
              <p className="text-sm text-danger">{categoryError}</p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setAddCategoryOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={categoryBusy}
              >
                Save
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <AddProductDialog
        shopId={shopId}
        open={addProductOpen}
        onClose={() => setAddProductOpen(false)}
        onCreated={() => void load()}
      />
    </div>
  );
}
