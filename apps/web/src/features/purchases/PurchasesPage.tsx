import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Filter,
  Plus,
  Search,
  ShoppingCart,
  Truck,
  Users,
  X,
} from "lucide-react";
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
import type { Product, ProductListResponse } from "@/features/products/types";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";

type LastPurchaseResponse = {
  lastPurchase: {
    quantity: number;
    unitCost: number;
    supplierId: string | null;
    purchasedAt: string | null;
  } | null;
  product: {
    _id: string;
    name: string;
    purchasePrice: number | null;
  };
};

type Supplier = { _id: string; name: string; phone: string | null };

type PurchaseItem = {
  name: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
};

type Purchase = {
  _id: string;
  supplierId: string | null;
  supplierName: string | null;
  status: string;
  total: number;
  purchasedAt: string | null;
  note: string | null;
  itemCount: number;
  items: PurchaseItem[];
};

type Summary = {
  monthTotal: number;
  lastMonthTotal: number;
  monthGrowthPct: number | null;
  purchaseCount: number;
  supplierCount: number;
};

type StatusFilter = "all" | "pending" | "received" | "cancelled";

const PAGE_SIZE = 10;

const SUPPLIER_COLORS = [
  "bg-sky-100 text-sky-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-emerald-100 text-emerald-800",
  "bg-rose-100 text-rose-800",
  "bg-indigo-100 text-indigo-800",
];

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

function formatShortDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function poNumber(id: string) {
  return `PO-${id.slice(-4).toUpperCase()}`;
}

function supplierInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SU";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function supplierColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash + name.charCodeAt(i) * (i + 1)) % SUPPLIER_COLORS.length;
  }
  return SUPPLIER_COLORS[hash] ?? SUPPLIER_COLORS[0]!;
}

function normalizeStatus(status: string): StatusFilter | "other" {
  const s = status.toUpperCase();
  if (s === "DRAFT" || s === "PENDING") return "pending";
  if (s === "COMPLETED" || s === "RECEIVED") return "received";
  if (s === "CANCELLED" || s === "CANCELED") return "cancelled";
  return "other";
}

function statusLabel(status: string) {
  const n = normalizeStatus(status);
  if (n === "pending") return "Pending";
  if (n === "cancelled") return "Cancelled";
  if (n === "received") return "Received";
  return status;
}

function statusTone(status: string): "success" | "warn" | "danger" | "neutral" {
  const n = normalizeStatus(status);
  if (n === "pending") return "warn";
  if (n === "cancelled") return "danger";
  if (n === "received") return "success";
  return "neutral";
}

function itemsQty(purchase: Purchase) {
  if (purchase.items.length > 0) {
    return purchase.items.reduce((s, i) => s + i.quantity, 0);
  }
  return purchase.itemCount;
}

function statusPillClass(status: string) {
  const n = normalizeStatus(status);
  if (n === "pending") return "bg-amber-50 text-amber-800";
  if (n === "cancelled") return "bg-rose-50 text-rose-700";
  if (n === "received") return "bg-emerald-50 text-emerald-700";
  return "bg-paper-2 text-ink-muted";
}

function profileInitials(name: string) {
  return supplierInitials(name || "SO");
}

const selectClass =
  "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink focus:border-forest";

export function PurchasesPage() {
  const { activeShop, user } = useAuth();
  const navigate = useNavigate();
  const shopId = activeShop?._id;
  const roleLabel =
    activeShop?.role === "OWNER"
      ? "Owner"
      : activeShop?.role
        ? activeShop.role.charAt(0) + activeShop.role.slice(1).toLowerCase()
        : "Team";
  const now = useMemo(() => new Date(), []);
  const [searchParams] = useSearchParams();
  const queryProductId = searchParams.get("productId")?.trim() || "";
  const queryQty = searchParams.get("qty")?.trim() || "";

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [supplierId, setSupplierId] = useState("");
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState("10");
  const [unitCost, setUnitCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [q, setQ] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [viewPurchase, setViewPurchase] = useState<Purchase | null>(null);
  const [newPoOpen, setNewPoOpen] = useState(Boolean(queryProductId));
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [supplierSheetOpen, setSupplierSheetOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState("");
  const [newSupplierPhone, setNewSupplierPhone] = useState("");
  const [addingSupplier, setAddingSupplier] = useState(false);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, p, prod] = await Promise.all([
        api<{ suppliers: Supplier[] }>(`/api/shops/${shopId}/suppliers`),
        api<{ purchases: Purchase[]; summary: Summary }>(
          `/api/shops/${shopId}/purchases`,
        ),
        api<ProductListResponse>(`/api/shops/${shopId}/products?pageSize=100`),
      ]);
      setSuppliers(s.suppliers);
      setPurchases(p.purchases);
      setSummary(p.summary);

      let nextProducts = prod.items;
      if (
        queryProductId &&
        !nextProducts.some((x) => x._id === queryProductId)
      ) {
        try {
          const last = await api<LastPurchaseResponse>(
            `/api/shops/${shopId}/purchases/last-for-product/${queryProductId}`,
          );
          nextProducts = [
            {
              _id: last.product._id,
              shopId,
              name: last.product.name,
              sellingPrice: 0,
              purchasePrice: last.product.purchasePrice,
              trackStock: true,
              isFavorite: false,
              active: true,
              availableStock: null,
              unit: "pcs",
            },
            ...nextProducts,
          ];
        } catch {
          // keep list
        }
      }

      setProducts(nextProducts);

      setProductId((prev) => {
        if (
          queryProductId &&
          nextProducts.some((x) => x._id === queryProductId)
        ) {
          return queryProductId;
        }
        if (prev && nextProducts.some((x) => x._id === prev)) return prev;
        return nextProducts[0]?._id || "";
      });

      if (!queryProductId) {
        setSupplierId((prev) => prev || s.suppliers[0]?._id || "");
      }
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Purchases data load fail",
      );
    } finally {
      setLoading(false);
    }
  }, [shopId, queryProductId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (queryProductId) setNewPoOpen(true);
  }, [queryProductId]);

  useEffect(() => {
    if (!shopId || !productId || !newPoOpen) return;

    let cancelled = false;
    void (async () => {
      try {
        const res = await api<LastPurchaseResponse>(
          `/api/shops/${shopId}/purchases/last-for-product/${productId}`,
        );
        if (cancelled) return;

        if (res.lastPurchase) {
          setQty(String(res.lastPurchase.quantity));
          setUnitCost(String(res.lastPurchase.unitCost));
          if (res.lastPurchase.supplierId) {
            setSupplierId(res.lastPurchase.supplierId);
          }
        } else {
          const isPrefill = productId === queryProductId;
          if (isPrefill && queryQty && Number(queryQty) > 0) {
            setQty(queryQty);
          }
          if (res.product.purchasePrice != null) {
            setUnitCost(String(res.product.purchasePrice));
          }
        }

        setProducts((prev) => {
          if (prev.some((p) => p._id === res.product._id)) return prev;
          return [
            {
              _id: res.product._id,
              shopId: shopId!,
              name: res.product.name,
              sellingPrice: 0,
              purchasePrice: res.product.purchasePrice,
              trackStock: true,
              isFavorite: false,
              active: true,
              availableStock: null,
              unit: "pcs",
            },
            ...prev,
          ];
        });
      } catch {
        if (cancelled) return;
        if (productId === queryProductId && queryQty && Number(queryQty) > 0) {
          setQty(queryQty);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shopId, productId, queryProductId, queryQty, newPoOpen]);

  useEffect(() => {
    setPage(1);
  }, [q, supplierFilter, statusFilter]);

  const totalCost = useMemo(() => {
    const qn = Number(qty);
    const c = Number(unitCost);
    if (!Number.isFinite(qn) || !Number.isFinite(c) || qn <= 0 || c < 0) {
      return 0;
    }
    return Math.round((qn * c + Number.EPSILON) * 100) / 100;
  }, [qty, unitCost]);

  const statusCounts = useMemo(() => {
    let pending = 0;
    let received = 0;
    let cancelled = 0;
    for (const p of purchases) {
      const n = normalizeStatus(p.status);
      if (n === "pending") pending += 1;
      else if (n === "cancelled") cancelled += 1;
      else received += 1;
    }
    return {
      all: purchases.length,
      pending,
      received,
      cancelled,
    };
  }, [purchases]);

  const totalPurchaseValue = useMemo(
    () =>
      purchases
        .filter((p) => normalizeStatus(p.status) === "received")
        .reduce((s, p) => s + p.total, 0),
    [purchases],
  );

  const topSuppliers = useMemo(() => {
    const map = new Map<
      string,
      { name: string; phone: string | null; total: number; orders: number }
    >();
    for (const p of purchases) {
      if (normalizeStatus(p.status) !== "received") continue;
      const key = p.supplierId ?? p.supplierName ?? "unknown";
      const name = p.supplierName ?? "Unknown supplier";
      const phone =
        suppliers.find((s) => s._id === p.supplierId)?.phone ?? null;
      const cur = map.get(key) ?? {
        name,
        phone,
        total: 0,
        orders: 0,
      };
      cur.total += p.total;
      cur.orders += 1;
      map.set(key, cur);
    }
    return [...map.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [purchases, suppliers]);

  const pendingDeliveries = useMemo(
    () =>
      purchases
        .filter((p) => normalizeStatus(p.status) === "pending")
        .slice(0, 5),
    [purchases],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return purchases.filter((p) => {
      const n = normalizeStatus(p.status);
      if (statusFilter === "pending" && n !== "pending") return false;
      if (statusFilter === "received" && n !== "received") return false;
      if (statusFilter === "cancelled" && n !== "cancelled") return false;
      if (supplierFilter !== "all" && p.supplierId !== supplierFilter) {
        return false;
      }
      if (!needle) return true;
      const po = poNumber(p._id).toLowerCase();
      const supplier = (p.supplierName ?? "").toLowerCase();
      return po.includes(needle) || supplier.includes(needle);
    });
  }, [purchases, q, statusFilter, supplierFilter]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  async function addSupplier(e: FormEvent) {
    e.preventDefault();
    if (!shopId || !newSupplier.trim()) return;
    setAddingSupplier(true);
    setError(null);
    try {
      const res = await api<{ supplier: Supplier }>(
        `/api/shops/${shopId}/suppliers`,
        {
          method: "POST",
          body: JSON.stringify({
            name: newSupplier.trim(),
            phone: newSupplierPhone.trim() || undefined,
          }),
        },
      );
      setNewSupplier("");
      setNewSupplierPhone("");
      setAddSupplierOpen(false);
      setSupplierId(res.supplier._id);
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Supplier add fail",
      );
    } finally {
      setAddingSupplier(false);
    }
  }

  async function createPurchase(e: FormEvent) {
    e.preventDefault();
    if (!shopId || !productId) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await api(`/api/shops/${shopId}/purchases`, {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierId || undefined,
          items: [
            {
              productId,
              quantity: Number(qty),
              unitCost: Number(unitCost),
            },
          ],
        }),
      });
      setSuccess(true);
      setQty("10");
      setNewPoOpen(false);
      await load();
      window.setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Purchase fail",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!shopId) return <PageLoader />;

  const greeting = greetingForHour(now.getHours());
  const avatar = profileInitials(user?.name || activeShop?.name || "SO");
  const supplierPhone = (name: string | null) =>
    suppliers.find((s) => s.name === name)?.phone ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl pb-4">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1 space-y-4 sm:space-y-5">
          {/* Mobile header — mock */}
          <header className="md:hidden">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-white text-ink shadow-soft"
                onClick={() => navigate(-1)}
                aria-label="Back"
              >
                <ArrowLeft className="size-4" />
              </button>
              <h1 className="text-lg font-bold text-ink">Purchases</h1>
              <div className="flex items-center gap-2">
                <Link
                  to="/more"
                  className="relative inline-flex size-10 items-center justify-center rounded-full border border-line bg-white text-ink-muted shadow-soft"
                  aria-label="Notifications"
                >
                  <Bell className="size-4" />
                  <span className="absolute right-2 top-2 size-2 rounded-full bg-danger" />
                </Link>
                <Link
                  to="/more"
                  className="inline-flex size-10 items-center justify-center rounded-full bg-[#1a1c2e] text-xs font-bold text-white"
                >
                  {avatar}
                </Link>
              </div>
            </div>
            <p className="mt-3 text-sm text-ink-muted">
              Suppliers se orders banayein aur receive karein 👋
            </p>
          </header>

          {/* Desktop header */}
          <header className="hidden flex-col gap-3 sm:flex-row sm:items-start sm:justify-between md:flex">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                {greeting}, {roleLabel}{" "}
                <span aria-hidden>👋</span>
              </h1>
              <p className="mt-1 text-sm text-ink-muted">
                Suppliers se stock order karein aur track karein.
              </p>
            </div>
            <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-soft">
              <CalendarDays className="size-4 text-forest" />
              {formatDashboardDate(now)}
            </div>
          </header>

          <div className="hidden flex-wrap items-start justify-between gap-3 md:flex">
            <div className="flex min-w-0 items-start gap-2.5">
              <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-forest">
                <Truck className="size-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold text-ink sm:text-2xl">
                  Purchases
                </h2>
                <p className="text-sm text-ink-muted">
                  Suppliers se orders banayein aur stock receive karein.
                </p>
              </div>
            </div>
            <Button
              variant="primary"
              leftIcon={<Plus className="size-4" />}
              onClick={() => {
                setError(null);
                setNewPoOpen(true);
              }}
            >
              New purchase order
            </Button>
          </div>

          {success ? (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
              <Check className="size-4" />
              Purchase complete — stock update ho gaya.
            </div>
          ) : null}

          {loading && !summary ? (
            <PageLoader />
          ) : error && !summary ? (
            <Surface className="space-y-3 p-5">
              <p className="text-sm text-danger">{error}</p>
              <Button type="button" variant="secondary" onClick={() => void load()}>
                Retry
              </Button>
            </Surface>
          ) : (
            <>
              {/* KPI — 2×2 mobile · 4 across desktop */}
              <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Surface className="space-y-2 !p-3.5 sm:!p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                      <ShoppingCart className="size-4" />
                    </span>
                    <p className="text-xs text-ink-muted sm:text-sm">
                      Total purchase value
                    </p>
                  </div>
                  <p className="font-display text-2xl font-semibold text-ink sm:text-3xl">
                    {formatINR(totalPurchaseValue || summary?.monthTotal || 0)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {statusCounts.all} orders total
                  </p>
                </Surface>

                <Surface className="space-y-2 !p-3.5 sm:!p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                      <Clock className="size-4" />
                    </span>
                    <p className="text-xs text-ink-muted sm:text-sm">
                      Pending orders
                    </p>
                  </div>
                  <p className="font-display text-2xl font-semibold text-ink sm:text-3xl">
                    {statusCounts.pending}
                  </p>
                  <p className="text-xs text-ink-muted">Awaiting delivery</p>
                </Surface>

                <Surface className="space-y-2 !p-3.5 sm:!p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <CheckCircle2 className="size-4" />
                    </span>
                    <p className="text-xs text-ink-muted sm:text-sm">Received</p>
                  </div>
                  <p className="font-display text-2xl font-semibold text-ink sm:text-3xl">
                    {statusCounts.received}
                  </p>
                  <p className="text-xs text-ink-muted">This period</p>
                </Surface>

                <Surface className="space-y-2 !p-3.5 sm:!p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                      <Users className="size-4" />
                    </span>
                    <p className="text-xs text-ink-muted sm:text-sm">
                      Active suppliers
                    </p>
                  </div>
                  <p className="font-display text-2xl font-semibold text-ink sm:text-3xl">
                    {summary?.supplierCount ?? suppliers.length}
                  </p>
                  <p className="text-xs text-ink-muted">On your list</p>
                </Surface>
              </section>

              <section className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                  <input
                    className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-sm outline-none focus:border-forest"
                    placeholder="PO number ya supplier..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    aria-label="Search purchases"
                  />
                </div>
                <button
                  type="button"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink shadow-soft md:hidden"
                  onClick={() => setSupplierSheetOpen(true)}
                  aria-label="Filter by supplier"
                >
                  <Filter className="size-4" />
                </button>
                <select
                  className="hidden h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink md:block"
                  value={supplierFilter}
                  onChange={(e) => setSupplierFilter(e.target.value)}
                  aria-label="Filter by supplier"
                >
                  <option value="all">All suppliers</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </section>

              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {(
                  [
                    ["all", "All", statusCounts.all],
                    ["pending", "Pending", statusCounts.pending],
                    ["received", "Received", statusCounts.received],
                    ["cancelled", "Cancelled", statusCounts.cancelled],
                  ] as const
                ).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    className={cn(
                      "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                      statusFilter === key
                        ? "bg-[#1a1c2e] text-white shadow-soft"
                        : "border border-line bg-white text-ink-muted hover:bg-paper-2",
                    )}
                  >
                    {label} ({count})
                  </button>
                ))}
              </div>

              <Button
                variant="primary"
                className="w-full md:hidden"
                leftIcon={<Plus className="size-4" />}
                onClick={() => {
                  setError(null);
                  setNewPoOpen(true);
                }}
              >
                New purchase order
              </Button>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={<Truck className="size-7" />}
                  title="Koi purchase nahi"
                  description="Naya purchase order bana ke stock receive karo."
                  actionLabel="New purchase order"
                  onAction={() => setNewPoOpen(true)}
                />
              ) : (
                <>
                  <Surface
                    padded={false}
                    className="hidden overflow-hidden md:block"
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[820px] text-left text-sm">
                        <thead className="border-b border-line bg-paper-2/60 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                          <tr>
                            <th className="px-4 py-3">PO number</th>
                            <th className="px-4 py-3">Supplier</th>
                            <th className="px-4 py-3">Items</th>
                            <th className="px-4 py-3">Amount</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paged.map((p) => {
                            const name = p.supplierName ?? "No supplier";
                            return (
                              <tr
                                key={p._id}
                                className="border-b border-line/70 last:border-0 hover:bg-paper-2/40"
                              >
                                <td className="px-4 py-3">
                                  <p className="font-semibold text-ink">
                                    {poNumber(p._id)}
                                  </p>
                                  <p className="text-xs text-ink-muted">
                                    {formatShortDate(p.purchasedAt)}
                                  </p>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    <span
                                      className={cn(
                                        "inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                        supplierColor(name),
                                      )}
                                    >
                                      {supplierInitials(name)}
                                    </span>
                                    <span className="truncate font-medium text-ink">
                                      {name}
                                    </span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-medium text-ink">
                                  {itemsQty(p)}
                                </td>
                                <td className="px-4 py-3 font-semibold text-ink">
                                  {formatINR(p.total)}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge tone={statusTone(p.status)}>
                                    {statusLabel(p.status)}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  <button
                                    type="button"
                                    className="inline-flex h-8 items-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-paper-2"
                                    onClick={() => setViewPurchase(p)}
                                  >
                                    View
                                  </button>
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
                      noun="orders"
                      onPageChange={setPage}
                    />
                  </Surface>

                  {/* Mobile PO cards — mock */}
                  <ul className="space-y-3 md:hidden">
                    {paged.map((p) => {
                      const name = p.supplierName ?? "No supplier";
                      return (
                        <li key={p._id}>
                          <div className="rounded-2xl border border-line/80 bg-white p-3.5 shadow-soft">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-bold text-ink">
                                  {poNumber(p._id)}
                                </p>
                                <p className="mt-0.5 text-xs text-ink-muted">
                                  {formatShortDate(p.purchasedAt)}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                                  statusPillClass(p.status),
                                )}
                              >
                                {statusLabel(p.status)}
                              </span>
                            </div>

                            <div className="mt-3 flex items-center gap-2.5">
                              <span
                                className={cn(
                                  "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                  supplierColor(name),
                                )}
                              >
                                {supplierInitials(name)}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-bold text-ink">
                                  {name}
                                </p>
                                <p className="text-xs text-ink-muted">
                                  {itemsQty(p)} items
                                </p>
                              </div>
                              <p className="shrink-0 text-sm font-bold text-ink">
                                {formatINR(p.total)}
                              </p>
                            </div>

                            <button
                              type="button"
                              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-xl bg-paper-2 text-sm font-semibold text-ink"
                              onClick={() => setViewPurchase(p)}
                            >
                              View details
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="md:hidden">
                    <Pagination
                      page={page}
                      pageSize={PAGE_SIZE}
                      total={filtered.length}
                      noun="orders"
                      onPageChange={setPage}
                    />
                  </div>

                  {/* Mobile: Top suppliers + Pending (mock image 3) */}
                  <div className="space-y-4 md:hidden">
                    <section>
                      <h3 className="mb-2 text-base font-bold text-ink">
                        Top suppliers
                      </h3>
                      <div className="overflow-hidden rounded-2xl border border-line/80 bg-white shadow-soft">
                        {topSuppliers.length === 0 ? (
                          <p className="px-4 py-5 text-sm text-ink-muted">
                            Abhi suppliers data nahi.
                          </p>
                        ) : (
                          <ul className="divide-y divide-line/70">
                            {topSuppliers.map((s) => (
                              <li
                                key={s.name}
                                className="flex items-center gap-2.5 px-4 py-3"
                              >
                                <span
                                  className={cn(
                                    "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                                    supplierColor(s.name),
                                  )}
                                >
                                  {supplierInitials(s.name)}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-bold text-ink">
                                    {s.name}
                                  </p>
                                  <p className="text-xs text-ink-muted">
                                    {s.phone || "No phone"}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-bold text-ink">
                                    {formatINR(s.total)}
                                  </p>
                                  <p className="text-[11px] text-ink-muted">
                                    {s.orders} orders
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button
                          type="button"
                          className="m-3 flex h-11 w-[calc(100%-1.5rem)] items-center justify-center gap-1.5 rounded-xl border border-dashed border-forest/40 bg-emerald-50/60 text-sm font-semibold text-forest"
                          onClick={() => {
                            setError(null);
                            setAddSupplierOpen(true);
                          }}
                        >
                          <Plus className="size-4" />
                          Add supplier
                        </button>
                      </div>
                    </section>

                    <section>
                      <h3 className="mb-2 text-base font-bold text-ink">
                        Pending deliveries
                      </h3>
                      <div className="overflow-hidden rounded-2xl border border-line/80 bg-white shadow-soft">
                        {pendingDeliveries.length === 0 ? (
                          <p className="px-4 py-5 text-sm text-ink-muted">
                            Koi pending delivery nahi.
                          </p>
                        ) : (
                          <ul className="divide-y divide-line/70">
                            {pendingDeliveries.map((p) => (
                              <li
                                key={p._id}
                                className="flex items-center gap-2.5 px-4 py-3"
                              >
                                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                                  <Truck className="size-4" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-bold text-ink">
                                    {poNumber(p._id)} ·{" "}
                                    {p.supplierName ?? "Supplier"}
                                  </p>
                                  <p className="text-xs text-ink-muted">
                                    {formatShortDate(p.purchasedAt)}
                                  </p>
                                </div>
                                <span
                                  className={cn(
                                    "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                                    statusPillClass(p.status),
                                  )}
                                >
                                  {statusLabel(p.status)}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {!loading || summary ? (
          <aside className="hidden w-full shrink-0 space-y-4 md:block xl:sticky xl:top-4 xl:w-[300px]">
            <Surface className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">
                Top suppliers
              </h3>
              {topSuppliers.length === 0 ? (
                <p className="text-sm text-ink-muted">Abhi suppliers data nahi.</p>
              ) : (
                <ul className="space-y-3">
                  {topSuppliers.map((s) => (
                    <li key={s.name} className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          supplierColor(s.name),
                        )}
                      >
                        {supplierInitials(s.name)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {s.name}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {s.phone || "No phone"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-ink">
                          {formatINR(s.total)}
                        </p>
                        <p className="text-[11px] text-ink-muted">
                          {s.orders} orders
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="secondary"
                className="mt-4 w-full"
                leftIcon={<Plus className="size-4" />}
                onClick={() => {
                  setError(null);
                  setAddSupplierOpen(true);
                }}
              >
                Add supplier
              </Button>
            </Surface>

            <Surface className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">
                Pending deliveries
              </h3>
              {pendingDeliveries.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Koi pending delivery nahi.
                </p>
              ) : (
                <ul className="space-y-3">
                  {pendingDeliveries.map((p) => (
                    <li
                      key={p._id}
                      className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5"
                    >
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                        <Truck className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {poNumber(p._id)} · {p.supplierName ?? "Supplier"}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatShortDate(p.purchasedAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg bg-forest px-2.5 py-1.5 text-xs font-semibold text-white"
                        onClick={() => setViewPurchase(p)}
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

      {newPoOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4"
          onClick={() => setNewPoOpen(false)}
        >
          <form
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-soft sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void createPurchase(e)}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  New purchase order
                </h2>
                <p className="mt-0.5 text-sm text-ink-muted">
                  Stock receive hote hi inventory update hogi.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl p-2 text-ink-muted hover:bg-paper-2"
                onClick={() => setNewPoOpen(false)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink">Supplier</span>
                <select
                  className={selectClass}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">— optional —</option>
                  {suppliers.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-ink">Product</span>
                <select
                  className={selectClass}
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  required
                >
                  {products.length === 0 ? (
                    <option value="">No products</option>
                  ) : null}
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Quantity"
                  type="number"
                  min="0.001"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                />
                <Input
                  label="Unit Cost (₹)"
                  type="number"
                  min="0"
                  step="any"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  required
                />
              </div>

              <div className="rounded-2xl border border-line bg-paper-2/50 px-4 py-3">
                <p className="text-sm text-ink-muted">Total Cost</p>
                <p className="mt-0.5 font-display text-2xl font-semibold text-ink">
                  {formatINR(totalCost)}
                </p>
              </div>

              {error ? <p className="text-sm text-danger">{error}</p> : null}

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  fullWidth
                  onClick={() => setNewPoOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" fullWidth loading={saving}>
                  Complete purchase
                </Button>
              </div>
            </div>
          </form>
        </div>
      ) : null}

      {addSupplierOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-4 sm:items-center"
          onClick={() => setAddSupplierOpen(false)}
        >
          <form
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => void addSupplier(e)}
          >
            <h2 className="text-lg font-semibold">Add supplier</h2>
            <Input
              label="Supplier name"
              value={newSupplier}
              onChange={(e) => setNewSupplier(e.target.value)}
              placeholder="e.g. Patel Distributors"
              required
              autoFocus
            />
            <Input
              label="Phone (optional)"
              value={newSupplierPhone}
              onChange={(e) => setNewSupplierPhone(e.target.value)}
              placeholder="98765 43210"
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setAddSupplierOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={addingSupplier}
              >
                Save
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {viewPurchase ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 sm:items-center sm:p-4"
          onClick={() => setViewPurchase(null)}
        >
          <div
            className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white shadow-soft sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2 sm:hidden">
              <span className="h-1 w-10 rounded-full bg-line" />
            </div>
            <div className="flex items-start justify-between gap-3 px-5 pb-2 pt-3">
              <h2 className="text-lg font-bold text-ink">
                {poNumber(viewPurchase._id)}
              </h2>
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-full bg-paper-2 text-ink-muted"
                onClick={() => setViewPurchase(null)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            <dl className="divide-y divide-line/70 border-y border-line/70 px-5">
              {(
                [
                  ["Supplier", viewPurchase.supplierName ?? "No supplier"],
                  [
                    "Phone",
                    supplierPhone(viewPurchase.supplierName) || "—",
                  ],
                  ["Order date", formatShortDate(viewPurchase.purchasedAt)],
                  [
                    "Expected delivery",
                    viewPurchase.purchasedAt
                      ? new Date(viewPurchase.purchasedAt)
                          .toISOString()
                          .slice(0, 10)
                      : "—",
                  ],
                  ["Status", statusLabel(viewPurchase.status)],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 py-3 text-sm"
                >
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="text-right font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="px-5 py-4">
              <p className="mb-2 text-sm font-bold text-ink-muted">Items</p>
              <ul className="space-y-2">
                {viewPurchase.items.length === 0 ? (
                  <li className="text-sm text-ink-muted">No line items.</li>
                ) : (
                  viewPurchase.items.map((item, idx) => (
                    <li
                      key={`${item.name}-${idx}`}
                      className="flex items-start justify-between gap-3 border-b border-dashed border-line/80 pb-2 text-sm last:border-0"
                    >
                      <p className="min-w-0 font-medium text-ink">
                        {item.name} × {item.quantity}
                      </p>
                      <p className="shrink-0 font-bold text-ink">
                        {formatINR(item.lineTotal)}
                      </p>
                    </li>
                  ))
                )}
              </ul>

              <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
                <span className="text-sm font-bold text-ink">Total</span>
                <span className="text-lg font-bold text-ink">
                  {formatINR(viewPurchase.total)}
                </span>
              </div>

              <Button
                className="mt-4"
                variant="secondary"
                fullWidth
                onClick={() => setViewPurchase(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {supplierSheetOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 md:hidden"
          onClick={() => setSupplierSheetOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-white shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-2">
              <span className="h-1 w-10 rounded-full bg-line" />
            </div>
            <div className="flex items-center justify-between px-5 pb-2 pt-3">
              <h2 className="text-base font-bold text-ink">Filter by supplier</h2>
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-full bg-paper-2 text-ink-muted"
                onClick={() => setSupplierSheetOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <ul className="max-h-[55dvh] overflow-y-auto border-t border-line/70 pb-6">
              <li>
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 border-b border-line/70 px-5 py-3.5 text-center text-sm font-semibold text-ink"
                  onClick={() => {
                    setSupplierFilter("all");
                    setSupplierSheetOpen(false);
                  }}
                >
                  All suppliers
                  {supplierFilter === "all" ? (
                    <Check className="size-4 text-forest" />
                  ) : null}
                </button>
              </li>
              {suppliers.map((s) => (
                <li key={s._id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-center gap-2 border-b border-line/70 px-5 py-3.5 text-center text-sm font-medium text-ink"
                    onClick={() => {
                      setSupplierFilter(s._id);
                      setSupplierSheetOpen(false);
                    }}
                  >
                    {s.name}
                    {supplierFilter === s._id ? (
                      <Check className="size-4 text-forest" />
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
