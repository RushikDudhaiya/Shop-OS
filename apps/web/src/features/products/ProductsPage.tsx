import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronRight,
  FileUp,
  LayoutGrid,
  Lightbulb,
  List,
  MoreVertical,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Star,
  Tag,
  X,
} from "lucide-react";
import { getShopCatalog, inferProductCategoryGroup } from "@shop-os/shared";
import {
  Button,
  EmptyState,
  PageLoader,
  Surface,
} from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";
import { BulkAddPanel } from "./BulkAddPanel";
import { AddProductDialog } from "./AddProductDialog";
import { categoryArtFor } from "./categoryArt";
import type { Product, ProductListResponse } from "./types";

type StockFilter = "all" | "low" | "out";
type SortKey = "name-asc" | "name-desc" | "price-asc" | "price-desc" | "stock";
type ViewMode = "grid" | "list";

const CATEGORY_BADGE: Record<string, string> = {
  Vegetables: "bg-emerald-50 text-emerald-700",
  Groceries: "bg-amber-50 text-amber-800",
  Snacks: "bg-orange-50 text-orange-700",
  Dairy: "bg-sky-50 text-sky-700",
  Beverages: "bg-cyan-50 text-cyan-800",
  "Personal Care": "bg-violet-50 text-violet-700",
  Hardware: "bg-slate-100 text-slate-700",
  Others: "bg-emerald-50 text-emerald-700",
};

const CATEGORY_DOT: Record<string, string> = {
  Vegetables: "bg-sky-500",
  Groceries: "bg-amber-500",
  Snacks: "bg-orange-500",
  Dairy: "bg-blue-500",
  Beverages: "bg-cyan-500",
  "Personal Care": "bg-violet-500",
  Hardware: "bg-slate-500",
  Others: "bg-ink-muted",
};

function greetingForHour(hour: number) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

function formatDashboardDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    weekday: "short",
  }).format(date);
}

function stockStatus(p: Product): "ok" | "low" | "out" | "none" {
  if (!p.trackStock) return "none";
  const qty = p.availableStock ?? 0;
  const min = p.minStock ?? 5;
  if (qty <= 0) return "out";
  if (qty <= min) return "low";
  return "ok";
}

function productCategory(p: Product) {
  return inferProductCategoryGroup(p.name, p.unit);
}

function ProductVisual({
  product,
  className,
}: {
  product: Product;
  className?: string;
}) {
  const art = categoryArtFor(product.name, product.unit);

  if (product.imageUrl) {
    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl bg-white",
          className,
        )}
      >
        <div
          className="absolute inset-0"
          style={{ background: art.bg }}
          aria-hidden
        />
        <img
          src={product.imageUrl}
          alt=""
          className="relative z-[1] size-full object-contain p-1.5"
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden rounded-2xl",
        className,
      )}
      style={{ background: art.bg }}
    >
      <span
        className="absolute -right-3 -top-3 size-14 rounded-full opacity-50"
        style={{ background: art.accent }}
        aria-hidden
      />
      <span className="relative text-3xl" aria-hidden>
        {art.emoji}
      </span>
    </div>
  );
}

function ProductCard({
  product,
  menuOpen,
  menuRef,
  onToggleMenu,
  onFavorite,
  onToggleActive,
  onAddSimilar,
}: {
  product: Product;
  menuOpen: boolean;
  menuRef?: RefObject<HTMLDivElement | null>;
  onToggleMenu: () => void;
  onFavorite: () => void;
  onToggleActive: () => void;
  onAddSimilar: () => void;
}) {
  const cat = productCategory(product);
  const stock = stockStatus(product);

  return (
    <Surface
      padded
      className={cn(
        "flex h-full flex-col gap-3 !rounded-2xl !p-3.5 shadow-soft",
        !product.active && "opacity-70",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <ProductVisual product={product} className="size-[72px] shrink-0" />
        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
            CATEGORY_BADGE[cat] ?? CATEGORY_BADGE.Others,
          )}
        >
          {cat}
        </span>
      </div>

      <div className="min-w-0">
        <p className="truncate text-[15px] font-bold leading-snug text-ink">
          {product.name}
        </p>
        <p className="mt-1 text-[15px] font-bold text-ink">
          {formatINR(product.sellingPrice)}
          <span className="ml-1 text-xs font-medium text-ink-muted">
            /{product.unit}
          </span>
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {stock === "none"
            ? "Stock: —"
            : `Stock: ${product.availableStock ?? 0}`}
        </p>
      </div>

      <div
        className="relative mt-auto flex items-center justify-between gap-2"
        ref={menuOpen ? menuRef : undefined}
      >
        <button
          type="button"
          className="inline-flex size-8 items-center justify-center rounded-xl bg-[#eef1f4] text-ink hover:bg-paper-2"
          aria-label="Edit product"
          title="Add similar"
          onClick={onAddSimilar}
        >
          <Pencil className="size-3.5" />
        </button>

        <div className="relative">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-xl bg-[#eef1f4] text-ink hover:bg-paper-2"
            aria-label="More actions"
            onClick={onToggleMenu}
          >
            <MoreVertical className="size-3.5" />
          </button>
          {menuOpen ? (
            <div className="absolute bottom-10 right-0 z-20 min-w-[148px] overflow-hidden rounded-xl border border-line bg-white py-1 shadow-soft">
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper-2"
                onClick={onFavorite}
              >
                <Star
                  className="size-3.5"
                  fill={product.isFavorite ? "currentColor" : "none"}
                />
                {product.isFavorite ? "Unfavorite" : "Favorite"}
              </button>
              <button
                type="button"
                className="flex w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
                onClick={onToggleActive}
              >
                {product.active ? "Mark inactive" : "Mark active"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </Surface>
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
        <p className="text-[11px] text-ink-muted">Total</p>
      </div>
    </div>
  );
}

export function ProductsPage() {
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const roleLabel =
    activeShop?.role === "OWNER"
      ? "Owner"
      : activeShop?.role
        ? activeShop.role.charAt(0) + activeShop.role.slice(1).toLowerCase()
        : "Team";
  const catalog = useMemo(
    () => getShopCatalog(activeShop?.businessType),
    [activeShop?.businessType],
  );

  const [q, setQ] = useState("");
  const [items, setItems] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [initialName, setInitialName] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [tipOpen, setTipOpen] = useState(true);
  const [enriching, setEnriching] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLDivElement | null>(null);
  const now = useMemo(() => new Date(), []);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const data = await api<ProductListResponse>(
        `/api/shops/${shopId}/products?q=${encodeURIComponent(q)}&pageSize=100&active=all`,
      );
      setItems(data.items);
      setTotal(data.total);
      setSuggestions(data.suggestions ?? []);
    } finally {
      setLoading(false);
    }
  }, [shopId, q]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void load();
    }, 250);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of items) {
      const c = productCategory(p);
      map.set(c, (map.get(c) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [items]);

  const stats = useMemo(() => {
    let inStock = 0;
    let out = 0;
    let low = 0;
    let stockValue = 0;
    for (const p of items) {
      const s = stockStatus(p);
      if (s === "out") out += 1;
      else if (s === "low") low += 1;
      else if (s === "ok") inStock += 1;
      if (p.trackStock && p.availableStock != null && p.availableStock > 0) {
        const unitCost = p.purchasePrice ?? p.sellingPrice;
        stockValue += unitCost * p.availableStock;
      }
    }
    return {
      total: total || items.length,
      inStock,
      out,
      low,
      stockValue,
    };
  }, [items, total]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (categoryFilter !== "All") {
      list = list.filter((p) => productCategory(p) === categoryFilter);
    }
    if (stockFilter === "low") {
      list = list.filter((p) => stockStatus(p) === "low");
    } else if (stockFilter === "out") {
      list = list.filter((p) => stockStatus(p) === "out");
    }
    list.sort((a, b) => {
      if (sortKey === "name-asc") return a.name.localeCompare(b.name);
      if (sortKey === "name-desc") return b.name.localeCompare(a.name);
      if (sortKey === "price-asc") return a.sellingPrice - b.sellingPrice;
      if (sortKey === "price-desc") return b.sellingPrice - a.sellingPrice;
      const sa = a.availableStock ?? -1;
      const sb = b.availableStock ?? -1;
      return sb - sa;
    });
    return list;
  }, [items, categoryFilter, stockFilter, sortKey]);

  async function toggleFavorite(product: Product) {
    if (!shopId) return;
    await api(`/api/shops/${shopId}/products/${product._id}/favorite`, {
      method: "POST",
      body: JSON.stringify({ isFavorite: !product.isFavorite }),
    });
    setMenuId(null);
    await load();
  }

  async function toggleActive(product: Product) {
    if (!shopId) return;
    await api(`/api/shops/${shopId}/products/${product._id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !product.active }),
    });
    setMenuId(null);
    await load();
  }

  async function createQuickItem(item: (typeof catalog.quickItems)[number]) {
    if (!shopId) return;
    await api(`/api/shops/${shopId}/products`, {
      method: "POST",
      body: JSON.stringify({ ...item, force: true }),
    });
    await load();
  }

  async function enrichCleanPhotos() {
    if (!shopId) return;
    setEnriching(true);
    try {
      await api(`/api/shops/${shopId}/products/enrich-images`, {
        method: "POST",
        body: "{}",
      });
      await load();
    } finally {
      setEnriching(false);
    }
  }

  function exportCsv() {
    const rows = [
      ["name", "sellingPrice", "unit", "barcode", "stock", "active"],
      ...items.map((p) => [
        p.name,
        String(p.sellingPrice),
        p.unit,
        p.barcode ?? "",
        p.availableStock == null ? "" : String(p.availableStock),
        p.active ? "1" : "0",
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
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openAdd(name = "") {
    setInitialName(name || q);
    setDialogOpen(true);
  }

  function openImport() {
    setShowImport(true);
    window.setTimeout(() => {
      importRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  if (!shopId) return <PageLoader />;

  const greeting = greetingForHour(now.getHours());
  const shopTip =
    catalog.quickItems[0]?.name && catalog.quickItems[1]?.name
      ? `Keep popular items like ${catalog.quickItems[0].name} and ${catalog.quickItems[1].name} always in stock — they sell fast!`
      : "Popular items stock mein rakho — jaldi bik jaate hain.";

  return (
    <div className="mx-auto w-full max-w-7xl pb-4">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-5">
          <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-gold" />
                <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                  {greeting}, {roleLabel}{" "}
                  <span aria-hidden>👋</span>
                </h1>
              </div>
              <p className="mt-1 text-sm text-ink-muted">
                Manage your products, stock and pricing all in one place.
              </p>
            </div>
            <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-soft">
              <CalendarDays className="size-4 text-forest" />
              {formatDashboardDate(now)}
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-forest/10 text-forest">
                <Package className="size-5" />
              </span>
              <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
                Products
              </h2>
            </div>
            <Button
              variant="primary"
              leftIcon={<Plus className="size-4" />}
              onClick={() => openAdd()}
            >
              Add Product
            </Button>
          </div>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Surface className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <Package className="size-4" />
                </span>
                <p className="text-sm text-ink-muted">Total Products</p>
              </div>
              <p className="font-display text-3xl font-semibold text-ink">
                {stats.total}
              </p>
              <p className="text-xs font-semibold text-success">
                {stats.inStock} in stock
              </p>
            </Surface>

            <Surface className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                  <AlertTriangle className="size-4" />
                </span>
                <p className="text-sm text-ink-muted">Low Stock</p>
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
                  <Tag className="size-4" />
                </span>
                <p className="text-sm text-ink-muted">Out of Stock</p>
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

            <Surface className="space-y-2 p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                  <ShoppingCart className="size-4" />
                </span>
                <p className="text-sm text-ink-muted">Total Stock Value</p>
              </div>
              <p className="font-display text-3xl font-semibold text-ink">
                {formatINR(stats.stockValue)}
              </p>
              <button
                type="button"
                className="text-xs font-semibold text-forest hover:underline"
                onClick={() => {
                  setStockFilter("all");
                  setSortKey("stock");
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
                placeholder="Search products by name, barcode, SKU..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search products"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setStockFilter("all");
                }}
                aria-label="Filter by category"
              >
                <option value="All">All Categories</option>
                {categoryCounts.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                aria-label="Sort products"
              >
                <option value="name-asc">Sort by: Name (A-Z)</option>
                <option value="name-desc">Sort by: Name (Z-A)</option>
                <option value="price-asc">Sort by: Price (Low)</option>
                <option value="price-desc">Sort by: Price (High)</option>
                <option value="stock">Sort by: Stock</option>
              </select>
              <div className="inline-flex rounded-xl border border-line bg-white p-1">
                <button
                  type="button"
                  className={cn(
                    "rounded-lg p-2 transition-colors",
                    viewMode === "grid"
                      ? "bg-forest text-white"
                      : "text-ink-muted hover:text-ink",
                  )}
                  aria-label="Grid view"
                  onClick={() => setViewMode("grid")}
                >
                  <LayoutGrid className="size-4" />
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-lg p-2 transition-colors",
                    viewMode === "list"
                      ? "bg-forest text-white"
                      : "text-ink-muted hover:text-ink",
                  )}
                  aria-label="List view"
                  onClick={() => setViewMode("list")}
                >
                  <List className="size-4" />
                </button>
              </div>
            </div>
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
                  ? "bg-forest text-white shadow-soft"
                  : "border border-line bg-white text-ink-muted hover:bg-paper-2",
              )}
            >
              All ({stats.total})
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
                  "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  categoryFilter === c.name
                    ? "bg-forest text-white shadow-soft"
                    : "border border-line bg-white text-ink-muted hover:bg-paper-2",
                )}
              >
                {c.name} ({c.count})
              </button>
            ))}
          </div>

          {stockFilter !== "all" ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
                Showing {stockFilter === "low" ? "low stock" : "out of stock"}
              </span>
              <button
                type="button"
                className="font-medium text-forest hover:underline"
                onClick={() => setStockFilter("all")}
              >
                Clear
              </button>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">Quick items</p>
            <div className="flex flex-wrap gap-2">
              {catalog.quickItems.map((item) => (
                <Button
                  key={item.name}
                  variant="secondary"
                  size="sm"
                  onClick={() => void createQuickItem(item)}
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </div>

          {showImport ? (
            <div ref={importRef}>
              <BulkAddPanel
                shopId={shopId}
                businessType={activeShop?.businessType}
                onImported={() => void load()}
              />
            </div>
          ) : null}

          {loading ? (
            <PageLoader />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<PackagePlus className="size-7" />}
              title={q ? `"${q}" nahi mila` : "Abhi koi product nahi"}
              description={
                q
                  ? "Add Product se abhi banao."
                  : "Pehli sale ke liye catalogue poora karne ki zarurat nahi."
              }
              actionLabel={q ? `+ Add "${q}"` : "Add product"}
              onAction={() => openAdd(q)}
            />
          ) : viewMode === "grid" ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map((p) => (
                <li key={p._id}>
                  <ProductCard
                    product={p}
                    menuOpen={menuId === p._id}
                    menuRef={menuId === p._id ? menuRef : undefined}
                    onToggleMenu={() =>
                      setMenuId((id) => (id === p._id ? null : p._id))
                    }
                    onFavorite={() => void toggleFavorite(p)}
                    onToggleActive={() => void toggleActive(p)}
                    onAddSimilar={() => openAdd(p.name)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <Surface padded={false} className="overflow-hidden">
              <ul className="divide-y divide-line/60">
                {filtered.map((p) => {
                  const cat = productCategory(p);
                  const stock = stockStatus(p);
                  return (
                    <li
                      key={p._id}
                      className="flex items-center gap-3 px-4 py-3 sm:px-5"
                    >
                      <div className="size-12 shrink-0 overflow-hidden rounded-xl">
                        <ProductVisual product={p} className="size-12" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {p.name}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {cat} ·{" "}
                          {stock === "none"
                            ? "No stock track"
                            : `Stock ${p.availableStock ?? 0}`}
                        </p>
                      </div>
                      <p className="shrink-0 font-display text-base font-semibold text-forest">
                        {formatINR(p.sellingPrice)}
                      </p>
                      <button
                        type="button"
                        className="rounded-lg p-1.5 text-ink-muted hover:bg-paper-2"
                        onClick={() => void toggleFavorite(p)}
                        aria-label="Toggle favorite"
                      >
                        <Star
                          className="size-4"
                          fill={p.isFavorite ? "currentColor" : "none"}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Surface>
          )}

          {suggestions.length > 0 && filtered.length === 0 ? (
            <Surface>
              <p className="mb-2 text-sm font-medium">Similar products</p>
              <ul className="space-y-1 text-sm text-ink-muted">
                {suggestions.map((s) => (
                  <li key={s._id}>
                    {s.name} — {formatINR(s.sellingPrice)}
                  </li>
                ))}
              </ul>
            </Surface>
          ) : null}
        </div>

        <aside className="w-full shrink-0 space-y-4 xl:sticky xl:top-4 xl:w-[280px]">
          <Surface className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Categories</h3>
              <button
                type="button"
                className="inline-flex items-center gap-0.5 text-xs font-semibold text-forest hover:underline"
                onClick={() => {
                  setCategoryFilter("All");
                  setStockFilter("all");
                }}
              >
                View All <ChevronRight className="size-3.5" />
              </button>
            </div>
            <ul className="space-y-1.5">
              {categoryCounts.length === 0 ? (
                <li className="text-sm text-ink-muted">No categories yet.</li>
              ) : (
                categoryCounts.slice(0, 8).map((c) => (
                  <li key={c.name}>
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter(c.name);
                        setStockFilter("all");
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm transition-colors hover:bg-paper-2",
                        categoryFilter === c.name && "bg-paper-2",
                      )}
                    >
                      <span
                        className={cn(
                          "size-2.5 shrink-0 rounded-full",
                          CATEGORY_DOT[c.name] ?? CATEGORY_DOT.Others,
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">
                        {c.name}
                      </span>
                      <span className="text-xs text-ink-muted">{c.count}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </Surface>

          <Surface className="space-y-3 p-4">
            <h3 className="text-sm font-semibold text-ink">Stock Status</h3>
            <StockStatusDonut
              inStock={stats.inStock}
              low={stats.low}
              out={stats.out}
              total={stats.total}
            />
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-ink-muted">
                  <span className="size-2.5 rounded-full bg-[#0d3d2a]" />
                  In Stock
                </span>
                <span className="font-semibold text-ink">{stats.inStock}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-ink-muted">
                  <span className="size-2.5 rounded-full bg-[#f2b705]" />
                  Low Stock
                </span>
                <span className="font-semibold text-ink">{stats.low}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-ink-muted">
                  <span className="size-2.5 rounded-full bg-[#c0392b]" />
                  Out of Stock
                </span>
                <span className="font-semibold text-ink">{stats.out}</span>
              </li>
            </ul>
          </Surface>

          <Surface className="space-y-2 p-4">
            <h3 className="mb-1 text-sm font-semibold text-ink">Quick Actions</h3>
            <Button
              variant="primary"
              className="w-full"
              leftIcon={<Plus className="size-4" />}
              onClick={() => openAdd()}
            >
              Add Product
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              leftIcon={<FileUp className="size-4" />}
              onClick={openImport}
            >
              Import Products
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              leftIcon={<FileUp className="size-4 rotate-180" />}
              onClick={exportCsv}
            >
              Export Products
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              leftIcon={<Sparkles className="size-4" />}
              onClick={() => void enrichCleanPhotos()}
              loading={enriching}
            >
              {enriching ? "Photos…" : "Clean Photos"}
            </Button>
          </Surface>

          {tipOpen ? (
            <div className="relative rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 pr-9">
              <button
                type="button"
                className="absolute right-2 top-2 rounded-lg p-1 text-ink-muted hover:bg-white/60"
                aria-label="Dismiss tip"
                onClick={() => setTipOpen(false)}
              >
                <X className="size-4" />
              </button>
              <div className="flex gap-2.5">
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-forest shadow-soft">
                  <Lightbulb className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">Shop Tip</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {shopTip}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      <AddProductDialog
        shopId={shopId}
        open={dialogOpen}
        initialName={initialName}
        onClose={() => setDialogOpen(false)}
        onCreated={() => void load()}
      />
    </div>
  );
}
