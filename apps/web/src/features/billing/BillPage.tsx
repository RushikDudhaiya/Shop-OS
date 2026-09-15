import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Banknote,
  Check,
  ChevronDown,
  HandCoins,
  History,
  Keyboard,
  LayoutGrid,
  List,
  Minus,
  Pause,
  Pencil,
  Plus,
  ScanBarcode,
  Search,
  Smartphone,
  Store,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { getShopCatalog } from "@shop-os/shared";
import {
  AppPageHeader,
  Button,
  EmptyState,
  Input,
  PageLoader,
  Surface,
} from "@/components/ui";
import type { CustomerRow } from "@/features/customers/types";
import { OVERDUE_DAYS } from "@/features/customers/customerUtils";
import { useAuth } from "@/features/auth/AuthContext";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";
import { onStockUpdated } from "@/lib/shopRealtime";
import { QuickAddDialog } from "@/features/products/QuickAddDialog";
import { categoryArtFor } from "@/features/products/categoryArt";
import { inferProductCategoryGroup } from "@shop-os/shared";
import type {
  CartLine,
  Product,
  ProductListResponse,
} from "@/features/products/types";
import { enqueueMutation } from "@/offline/queue";
import { isLooseProduct, formatLooseQty, resolveLooseSale } from "./looseUnits";
import { PaymentSheet, type PayMethod } from "./PaymentSheet";
import { SaleCompleteView } from "./SaleCompleteView";
import { WeightPickerSheet } from "./WeightPickerSheet";
import "./bill-layout.css";

type SaleResponse = {
  sale: {
    _id: string;
    invoiceNumber: string;
    subtotal?: number;
    tax?: number;
    discount?: number;
    total: number;
    amountPaid: number;
    amountDue: number;
    customerId?: string | null;
  };
  change?: number;
  payments: Array<{ method: string }>;
};

type ShopTaxSettings = {
  gstEnabled?: boolean;
  gstRate?: number;
  taxType?: "GST" | "VAT" | "NONE";
  taxLabel?: string;
};

const HOLD_KEY = "shop_os_held_bill";
const RECENT_KEY = "shop_os_recent_sold";

const BILL_TIPS_INLINE = [
  "Scan barcode for instant add",
  "Use Hold Bill for multiple customers",
  "Enter quantity with keyboard",
] as const;

function customerAvatarColor(index: number) {
  const colors = [
    "bg-emerald-100 text-emerald-700",
    "bg-sky-100 text-sky-700",
    "bg-violet-100 text-violet-700",
    "bg-amber-100 text-amber-700",
    "bg-rose-100 text-rose-700",
    "bg-teal-100 text-teal-700",
  ];
  return colors[index % colors.length];
}

function customerDueTone(customer: CustomerRow) {
  if (customer.outstandingDue <= 0) return "text-success";
  if (customer.lastPurchaseAt) {
    const days =
      (Date.now() - new Date(customer.lastPurchaseAt).getTime()) / 86_400_000;
    if (days > OVERDUE_DAYS) return "text-danger";
  }
  return "text-success";
}

function unitLabel(unit?: string | null) {
  const u = (unit || "piece").trim().toLowerCase();
  if (u === "kg" || u === "g" || u === "gm") return u === "gm" ? "G" : u.toUpperCase();
  if (u === "l" || u === "lt" || u === "ltr" || u === "ml") return u === "ml" ? "ML" : "L";
  if (u === "piece" || u === "pcs" || u === "pc") return "piece";
  if (u === "packet" || u === "pkt" || u === "pack" || u === "bag") return "pack";
  if (u === "tube" || u === "bottle") return u;
  return u;
}

function categoryGroupFor(name: string, unit?: string) {
  return inferProductCategoryGroup(name, unit ?? null);
}

function stockStatus(product: Product) {
  if (!product.trackStock || product.availableStock == null) {
    return {
      label: "IN STOCK",
      tone: "text-success bg-success-soft",
      count: null as number | null,
    };
  }
  if (product.availableStock <= 0) {
    return {
      label: "Out of Stock",
      tone: "text-danger bg-danger-soft",
      count: 0,
    };
  }
  if (product.minStock != null && product.availableStock <= product.minStock) {
    return {
      label: "Low Stock",
      tone: "text-orange-700 bg-orange-100",
      count: product.availableStock,
    };
  }
  return {
    label: "IN STOCK",
    tone: "text-success bg-success-soft",
    count: product.availableStock,
  };
}

function isProductOutOfStock(product: Product) {
  return (
    product.trackStock &&
    product.availableStock != null &&
    product.availableStock <= 0
  );
}

function customerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "CU";
}

function quickItemIcon(name: string) {
  const n = name.toLowerCase();
  if (/toffee|candy|mithai/.test(n)) return "🍬";
  if (/choco/.test(n)) return "🍫";
  if (/biscuit|cookie|parle/.test(n)) return "🍪";
  if (/snack|chip|namkeen/.test(n)) return "🥨";
  if (/screw|nail|washer|bolt/.test(n)) return "🔩";
  if (/cable|wire|tie/.test(n)) return "🔌";
  return "✦";
}

function readRecentIds(): string[] {
  try {
    const raw = sessionStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw) as string[];
    return Array.isArray(ids) ? ids.slice(0, 24) : [];
  } catch {
    return [];
  }
}

function pushRecentIds(ids: string[]) {
  const prev = readRecentIds();
  const next = [...ids, ...prev.filter((id) => !ids.includes(id))].slice(0, 24);
  sessionStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function ProductThumb({
  name,
  unit,
  imageUrl,
  className,
}: {
  name: string;
  unit?: string;
  imageUrl?: string | null;
  className?: string;
}) {
  const art = categoryArtFor(name, unit);
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-xl bg-paper-2",
        className,
      )}
      style={{ background: art.bg }}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="size-full object-contain p-1"
          loading="lazy"
        />
      ) : (
        <span className="flex size-full items-center justify-center font-display text-lg font-semibold text-forest">
          {letter}
        </span>
      )}
    </div>
  );
}

export function BillPage() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const shopCatalog = useMemo(
    () => getShopCatalog(activeShop?.businessType),
    [activeShop?.businessType],
  );
  const [q, setQ] = useState("");
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [mobileCartTop, setMobileCartTop] = useState(140);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [discountPercent, setDiscountPercent] = useState(0);
  const holdActionsRef = useRef<HTMLDivElement | null>(null);
  const [billNote, setBillNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [holdMsg, setHoldMsg] = useState<string | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [weightPick, setWeightPick] = useState<{
    product: Product;
    mode: "add" | "edit";
    initialQty?: number;
  } | null>(null);
  const [completed, setCompleted] = useState<{
    saleId: string;
    invoiceNumber: string;
    subtotal: number;
    tax: number;
    taxLabel: string;
    gstRate: number;
    discount: number;
    roundOff: number;
    total: number;
    methodLabel: string;
    change: number;
    amountDue: number;
    customerPhone?: string | null;
    completedAt: string;
    items: Array<{
      name: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }>;
  } | null>(null);
  const [taxSettings, setTaxSettings] = useState<ShopTaxSettings>({});
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sortBy, setSortBy] = useState<"popular" | "name" | "price">("popular");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(
    null,
  );
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [cartCustomerOpen, setCartCustomerOpen] = useState(false);
  const [newCustomerMode, setNewCustomerMode] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerSaving, setNewCustomerSaving] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [recentCustomers, setRecentCustomers] = useState<CustomerRow[]>([]);
  const [activePayMethod, setActivePayMethod] = useState<PayMethod>("CASH");
  const [heldCount, setHeldCount] = useState(0);
  const customerMenuRef = useRef<HTMLDivElement | null>(null);
  const billClickLockUntilRef = useRef(0);

  const loadFavorites = useCallback(async () => {
    if (!shopId) return;
    const data = await api<ProductListResponse>(
      `/api/shops/${shopId}/products?favorites=1&pageSize=20`,
    );
    setFavorites(data.items);
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    void (async () => {
      try {
        const data = await api<{ shop: { settings?: ShopTaxSettings } }>(
          `/api/shops/${shopId}`,
        );
        setTaxSettings(data.shop.settings ?? {});
      } catch {
        setTaxSettings({});
      }
    })();
  }, [shopId]);

  const loadCatalog = useCallback(
    async (query = "") => {
      if (!shopId) return;
      const searchingNow = Boolean(query.trim());
      if (searchingNow) setSearching(true);
      else setCatalogLoading(true);
      try {
        const params = new URLSearchParams({ pageSize: "60" });
        if (query.trim()) params.set("q", query.trim());
        const data = await api<ProductListResponse>(
          `/api/shops/${shopId}/products?${params}`,
        );
        setCatalog(data.items);
      } finally {
        setSearching(false);
        setCatalogLoading(false);
      }
    },
    [shopId],
  );

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    return onStockUpdated((payload) => {
      if (payload.shopId !== shopId) return;
      const map = new Map(
        payload.updates.map((u) => [u.productId, u.currentStock]),
      );
      const patch = (list: Product[]) =>
        list.map((p) =>
          map.has(p._id)
            ? { ...p, availableStock: map.get(p._id) ?? p.availableStock }
            : p,
        );
      setCatalog((prev) => patch(prev));
      setFavorites((prev) => patch(prev));
    });
  }, [shopId]);

  useEffect(() => {
    if (!shopId) return;
    void api<{ customers: CustomerRow[] }>(
      `/api/shops/${shopId}/customers?pageSize=20`,
    )
      .then((data) => setRecentCustomers(data.customers))
      .catch(() => setRecentCustomers([]));
  }, [shopId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HOLD_KEY);
      if (raw) {
        const held = JSON.parse(raw) as { cart?: CartLine[] };
        if (held.cart?.length) setHeldCount(1);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void loadCatalog(q);
    }, q.trim() ? 200 : 0);
    return () => window.clearTimeout(t);
  }, [q, loadCatalog]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HOLD_KEY);
      if (!raw) return;
      const held = JSON.parse(raw) as { cart: CartLine[]; note?: string };
      if (held.cart?.length) {
        setCart(held.cart);
        setBillNote(held.note ?? "");
        setHoldMsg("Held bill restore ho gaya");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!holdMsg) return;
    const t = window.setTimeout(() => setHoldMsg(null), 2800);
    return () => window.clearTimeout(t);
  }, [holdMsg]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    function onChange() {
      if (mq.matches) setCustomerMenuOpen(false);
    }
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (cart.length === 0) setMobileCartOpen(false);
  }, [cart.length]);

  useEffect(() => {
    if (mobileCartOpen) return;
    setCartCustomerOpen(false);
    setNewCustomerMode(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerError(null);
  }, [mobileCartOpen]);

  function closeCartCustomerPicker() {
    setCartCustomerOpen(false);
    setNewCustomerMode(false);
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerError(null);
  }

  function openCustomerPicker() {
    setCustomerMenuOpen(false);
    if (cartCustomerOpen) closeCartCustomerPicker();
    else setCartCustomerOpen(true);
  }

  function openNewCustomerForm() {
    setCustomerMenuOpen(false);
    setPayMethod(null);
    setCartCustomerOpen(true);
    setNewCustomerMode(true);
    setNewCustomerError(null);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setMobileCartOpen(true);
    }
  }

  async function saveNewCartCustomer() {
    if (!shopId || !newCustomerName.trim()) return;
    setNewCustomerSaving(true);
    setNewCustomerError(null);
    try {
      const data = await api<{
        customer: { _id: string; name: string; phone: string | null };
      }>(`/api/shops/${shopId}/customers`, {
        method: "POST",
        body: JSON.stringify({
          name: newCustomerName.trim(),
          phone:
            newCustomerPhone.length === 10 ? newCustomerPhone : undefined,
        }),
      });
      const existing = recentCustomers.find((c) => c._id === data.customer._id);
      const row: CustomerRow = existing ?? {
        _id: data.customer._id,
        name: data.customer.name,
        phone: data.customer.phone,
        outstandingDue: 0,
        lastPurchaseAt: null,
        lastInvoiceNumber: null,
        purchaseCount: 0,
        purchaseTotal: 0,
      };
      setSelectedCustomer({
        ...row,
        name: data.customer.name,
        phone: data.customer.phone,
      });
      setRecentCustomers((prev) =>
        [
          { ...row, name: data.customer.name, phone: data.customer.phone },
          ...prev.filter((c) => c._id !== row._id),
        ].slice(0, 20),
      );
      // Prevent Save tap from also hitting Create Bill underneath.
      billClickLockUntilRef.current = Date.now() + 500;
      closeCartCustomerPicker();
    } catch (err) {
      setNewCustomerError(
        err instanceof ApiRequestError ? err.body.message : "Create fail",
      );
    } finally {
      setNewCustomerSaving(false);
    }
  }

  useEffect(() => {
    if (!mobileCartOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileCartOpen]);

  useLayoutEffect(() => {
    function measureCartTop() {
      const el = holdActionsRef.current;
      if (!el) return;
      const bottom = el.getBoundingClientRect().bottom;
      // Sheet starts just below Hold Bill / Recent Bills — not above
      setMobileCartTop(Math.max(96, Math.round(bottom + 8)));
    }
    measureCartTop();
    if (!mobileCartOpen) return;
    window.addEventListener("resize", measureCartTop);
    return () => window.removeEventListener("resize", measureCartTop);
  }, [mobileCartOpen]);

  const itemsTotal = useMemo(
    () =>
      Math.round(
        cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0) *
          100,
      ) / 100,
    [cart],
  );

  const discountAmount = useMemo(() => {
    if (discountPercent <= 0 || itemsTotal <= 0) return 0;
    const pct = Math.min(100, Math.max(0, discountPercent));
    return Math.round(((itemsTotal * pct) / 100 + Number.EPSILON) * 100) / 100;
  }, [discountPercent, itemsTotal]);

  const afterDiscount =
    Math.round((Math.max(0, itemsTotal - discountAmount) + Number.EPSILON) * 100) /
    100;

  const gstEnabled =
    Boolean(taxSettings.gstEnabled) && taxSettings.taxType !== "NONE";
  const gstRate =
    gstEnabled && Number(taxSettings.gstRate) > 0
      ? Number(taxSettings.gstRate)
      : 0;
  const gstAmount =
    gstRate > 0
      ? Math.round(((afterDiscount * gstRate) / 100 + Number.EPSILON) * 100) /
        100
      : 0;
  const taxLabel =
    taxSettings.taxLabel?.trim() ||
    (taxSettings.taxType === "VAT" ? "VAT" : "GST");

  const beforeRound =
    Math.round((afterDiscount + gstAmount + Number.EPSILON) * 100) / 100;
  const payable = Math.round(beforeRound);
  const roundOff = Math.round((payable - beforeRound) * 100) / 100;
  const chargeTotal =
    Math.abs(roundOff) >= 0.01 ? payable : beforeRound;
  const total = chargeTotal;

  const visibleCatalog = useMemo(() => {
    if (!showRecent || q.trim()) return catalog;
    const recent = new Set(readRecentIds());
    if (recent.size === 0) return favorites.length ? favorites : catalog;
    const ranked = catalog.filter((p) => recent.has(p._id));
    return ranked.length ? ranked : favorites.length ? favorites : catalog;
  }, [catalog, favorites, showRecent, q]);

  const categoryChips = useMemo(() => {
    const groups = new Set<string>();
    for (const p of catalog) {
      const g = categoryGroupFor(p.name, p.unit);
      if (g !== "Other") groups.add(g);
    }
    return ["All", ...Array.from(groups).sort()];
  }, [catalog]);

  const filteredCatalog = useMemo(() => {
    let items = visibleCatalog;
    if (categoryFilter !== "All") {
      items = items.filter(
        (p) => categoryGroupFor(p.name, p.unit) === categoryFilter,
      );
    }
    if (sortBy === "name") {
      items = [...items].sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "price") {
      items = [...items].sort((a, b) => a.sellingPrice - b.sellingPrice);
    }
    return items;
  }, [visibleCatalog, categoryFilter, sortBy]);

  const qtyInCart = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) map.set(line.productId, line.quantity);
    return map;
  }, [cart]);

  function flashProduct(productId: string) {
    setFlashId(productId);
    window.setTimeout(
      () => setFlashId((id) => (id === productId ? null : id)),
      280,
    );
  }

  function addToCart(product: Product, quantity = 1) {
    setCart((prev) => {
      const hit = prev.find((l) => l.productId === product._id);
      if (hit) {
        return prev.map((l) =>
          l.productId === product._id
            ? { ...l, quantity: l.quantity + quantity }
            : l,
        );
      }
      return [
        ...prev,
        {
          productId: product._id,
          name: product.name,
          unitPrice: product.sellingPrice,
          quantity,
          trackStock: product.trackStock,
          unit: product.unit || "piece",
          imageUrl: product.imageUrl ?? null,
        },
      ];
    });
    flashProduct(product._id);
  }

  function setCartQty(productId: string, quantity: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.productId === productId ? { ...l, quantity } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  function clearCart() {
    setCart([]);
    setBillNote("");
    setNoteOpen(false);
    setDiscountPercent(0);
    setDiscountInput("");
    setDiscountOpen(false);
    sessionStorage.removeItem(HOLD_KEY);
  }

  function applyDiscountPercent() {
    const n = Number(discountInput);
    if (!Number.isFinite(n) || n < 0) {
      setDiscountPercent(0);
      setDiscountInput("");
      setDiscountOpen(false);
      return;
    }
    const pct = Math.min(100, Math.round(n * 100) / 100);
    setDiscountPercent(pct);
    setDiscountInput(pct > 0 ? String(pct) : "");
    setDiscountOpen(false);
  }

  function holdBill() {
    if (!cart.length) {
      setHoldMsg("Cart khali hai — pehle items add karo");
      return;
    }
    sessionStorage.setItem(
      HOLD_KEY,
      JSON.stringify({ cart, note: billNote }),
    );
    setHeldCount(1);
    setHoldMsg("Bill hold ho gaya — baad mein wapas aa jayega");
    setCart([]);
    setBillNote("");
  }

  function selectProduct(product: Product) {
    if (isProductOutOfStock(product)) return;
    if (isLooseProduct(product)) {
      const existing = cart.find((l) => l.productId === product._id);
      const plan = resolveLooseSale(product);
      setWeightPick({
        product,
        mode: existing ? "edit" : "add",
        initialQty: existing
          ? plan.toBillingQty(existing.quantity)
          : undefined,
      });
      return;
    }
    addToCart(product, 1);
  }

  function bumpQty(productId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.productId === productId
            ? { ...l, quantity: l.quantity + delta }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }

  async function ensureQuickItem(item: (typeof shopCatalog.quickItems)[number]) {
    if (!shopId) return;
    const existing = await api<ProductListResponse>(
      `/api/shops/${shopId}/products?q=${encodeURIComponent(item.name)}&pageSize=5`,
    );
    const match = existing.items.find(
      (p) => p.name.toLowerCase() === item.name.toLowerCase(),
    );
    if (match) {
      selectProduct(match);
      return;
    }
    const created = await api<{ product: Product }>(
      `/api/shops/${shopId}/products`,
      {
        method: "POST",
        body: JSON.stringify({ ...item, force: true }),
      },
    );
    selectProduct(created.product);
    await loadFavorites();
  }

  async function completeSale(payload: {
    method: PayMethod;
    amount?: number;
    receivedAmount?: number;
    customerName?: string;
    customerPhone?: string;
  }) {
    if (!shopId || !cart.length) return;
    setPaying(true);
    setPayError(null);

    const methodLabel =
      payload.method === "CASH"
        ? "Cash"
        : payload.method === "UPI"
          ? "UPI"
          : "Udhaar";
    const saleItems = cart.map((line) => ({
      name: line.name,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal:
        Math.round(line.unitPrice * line.quantity * 100) / 100,
    }));
    const saleDiscount = discountAmount;
    const completedAt = new Date().toISOString();

    function buildCompletedSnapshot(input: {
      saleId: string;
      invoiceNumber: string;
      subtotal: number;
      tax: number;
      total: number;
      change?: number;
      amountDue?: number;
    }) {
      return {
        saleId: input.saleId,
        invoiceNumber: input.invoiceNumber,
        subtotal: input.subtotal,
        tax: input.tax,
        taxLabel,
        gstRate,
        discount: saleDiscount,
        roundOff,
        total: input.total,
        methodLabel,
        change:
          payload.method === "CASH" && payload.receivedAmount
            ? Math.max(0, payload.receivedAmount - input.total)
            : (input.change ?? 0),
        amountDue: input.amountDue ?? 0,
        customerPhone:
          payload.customerPhone ?? selectedCustomer?.phone ?? null,
        completedAt,
        items: saleItems,
      };
    }

    try {
      const body: Record<string, unknown> = {
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        complete: true,
        idempotencyKey: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
        payment: {
          method: payload.method,
          ...(payload.amount !== undefined ? { amount: payload.amount } : {}),
          ...(payload.receivedAmount !== undefined
            ? { receivedAmount: payload.receivedAmount }
            : {}),
        },
      };
      if (gstAmount > 0.009) body.tax = gstAmount;
      else if (roundOff > 0.009) body.tax = roundOff;
      if (saleDiscount > 0.009) body.discount = saleDiscount;
      if (selectedCustomer?._id) {
        body.customerId = selectedCustomer._id;
      } else if (payload.method === "CREDIT") {
        body.customer = {
          name: payload.customerName,
          phone: payload.customerPhone,
        };
      }

      const idempotencyKey = String(body.idempotencyKey);

      if (!navigator.onLine) {
        await enqueueMutation({
          shopId,
          path: `/api/shops/${shopId}/sales`,
          method: "POST",
          body,
          idempotencyKey,
        });
        setCompleted(
          buildCompletedSnapshot({
            saleId: `offline-${idempotencyKey}`,
            invoiceNumber: "OFFLINE-PENDING",
            subtotal: itemsTotal,
            tax: gstAmount,
            total,
            amountDue: payload.method === "CREDIT" ? total : 0,
          }),
        );
        clearCart();
        setPayMethod(null);
        pushRecentIds(cart.map((l) => l.productId));
        return;
      }

      const res = await api<SaleResponse>(`/api/shops/${shopId}/sales`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      pushRecentIds(cart.map((l) => l.productId));
      setCompleted(
        buildCompletedSnapshot({
          saleId: res.sale._id,
          invoiceNumber: res.sale.invoiceNumber,
          subtotal: res.sale.subtotal ?? itemsTotal,
          tax: gstAmount,
          total: res.sale.total,
          change: res.change ?? 0,
          amountDue: res.sale.amountDue,
        }),
      );
      clearCart();
      setPayMethod(null);
    } catch (err) {
      setPayError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Sale complete nahi hui",
      );
    } finally {
      setPaying(false);
    }
  }

  function resetBill() {
    setCompleted(null);
    clearCart();
    setQ("");
    setPayError(null);
    setHoldMsg(null);
    setSelectedCustomer(null);
    setActivePayMethod("CASH");
  }

  function handleCreateBill() {
    if (!cart.length || total <= 0) return;
    if (Date.now() < billClickLockUntilRef.current) return;
    if (cartCustomerOpen || newCustomerMode || newCustomerSaving) return;
    setPayError(null);
    if (activePayMethod === "CASH") {
      void completeSale({
        method: "CASH",
        amount: total,
        receivedAmount: total,
      });
      return;
    }
    if (activePayMethod === "UPI") {
      void completeSale({ method: "UPI", amount: total });
      return;
    }
    if (activePayMethod === "CREDIT") {
      if (selectedCustomer) {
        void completeSale({
          method: "CREDIT",
          customerName: selectedCustomer.name,
          customerPhone: selectedCustomer.phone ?? undefined,
        });
        return;
      }
      setPayMethod("CREDIT");
      return;
    }
  }

  if (!shopId) return <PageLoader />;

  if (completed) {
    return (
      <div className="bill-complete-main">
        <SaleCompleteView
          shopId={shopId}
          {...completed}
          onNewBill={resetBill}
        />
      </div>
    );
  }

  const showEmptySearch =
    q.trim() && !searching && !catalogLoading && catalog.length === 0;
  const canPay = cart.length > 0 && total > 0;

  return (
    <>
    <div className="bill-layout">
      <div className="bill-main">
        <div className="bill-main-top">
        <div className="relative">
          <AppPageHeader
            title="New Bill"
            subtitle="Add products to cart and complete the bill."
            action={
              <div className="flex w-full flex-wrap gap-2">
                <button
                  type="button"
                  onClick={holdBill}
                  className="bill-page-action-btn relative"
                >
                  <Pause className="size-3.5" />
                  Hold Bill
                  {heldCount > 0 ? (
                    <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-orange-500 text-[9px] font-bold text-white">
                      {heldCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRecent((v) => !v)}
                  className="bill-page-action-btn"
                >
                  <History className="size-3.5" />
                  Recent Bills
                </button>
                <button
                  type="button"
                  onClick={() => searchRef.current?.focus()}
                  className="bill-page-action-btn"
                  data-hide-mobile="true"
                >
                  <Keyboard className="size-3.5" />
                  Keyboard (F2)
                </button>
              </div>
            }
          />
          {/* Cart sheet top edge = below Hold / Recent Bills row */}
          <span
            ref={holdActionsRef}
            className="pointer-events-none absolute inset-x-0 bottom-0 h-0 md:hidden"
            aria-hidden
          />
        </div>

        {holdMsg ? (
          <p className="text-xs text-forest" role="status">
            {holdMsg}
          </p>
        ) : null}

        <div className="bill-search-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              ref={searchRef}
              className="bill-search-input placeholder:text-ink-muted/70"
              placeholder="Search by name, barcode, SKU..."
              aria-label="Filter products"
              value={q}
              onChange={(e) => {
                setShowRecent(false);
                setQ(e.target.value);
              }}
            />
          </div>
          <button
            type="button"
            onClick={() => searchRef.current?.focus()}
            className="bill-scan-btn hover:bg-paper-2"
          >
            <ScanBarcode className="size-4" />
            Scan
          </button>
          <div
            ref={customerMenuRef}
            className="relative w-full sm:w-auto sm:shrink-0 lg:hidden"
          >
            <button
              type="button"
              onClick={() => setCustomerMenuOpen((v) => !v)}
              className="bill-customer-select"
              aria-label="Select customer"
              aria-expanded={customerMenuOpen}
            >
              <User className="size-4 shrink-0 text-ink-muted" />
              <span className="bill-customer-select-label">
                {selectedCustomer?.name ?? "Walk-in Customer"}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-ink-muted transition-transform",
                  customerMenuOpen && "rotate-180",
                )}
              />
            </button>
          </div>
        </div>

        {customerMenuOpen
          ? createPortal(
              <div className="fixed inset-0 z-[80] flex items-end justify-center lg:hidden">
                <button
                  type="button"
                  className="absolute inset-0 bg-ink/45"
                  aria-label="Close customers"
                  onClick={() => setCustomerMenuOpen(false)}
                />
                <div
                  className="relative z-[1] w-full max-w-lg rounded-t-3xl bg-white p-4 shadow-soft"
                  role="dialog"
                  aria-label="Recent customers"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-base font-bold text-ink">
                      Recent Customers
                    </p>
                    <button
                      type="button"
                      className="inline-flex size-9 items-center justify-center rounded-xl bg-paper-2 text-ink-muted"
                      aria-label="Close"
                      onClick={() => setCustomerMenuOpen(false)}
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex gap-2.5 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerMenuOpen(false);
                      }}
                      className={cn(
                        "flex min-w-[152px] items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left shadow-soft transition-colors",
                        !selectedCustomer
                          ? "border-forest ring-1 ring-forest/20"
                          : "border-line hover:bg-paper-2/60",
                      )}
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-semibold text-white">
                        W
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">
                          Walk-in
                        </p>
                        <p className="text-[11px] font-medium text-ink-muted">
                          Default
                        </p>
                      </div>
                    </button>
                    {recentCustomers.slice(0, 10).map((c, index) => (
                      <button
                        key={c._id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerMenuOpen(false);
                        }}
                        className={cn(
                          "flex min-w-[152px] items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left shadow-soft transition-colors",
                          selectedCustomer?._id === c._id
                            ? "border-forest ring-1 ring-forest/20"
                            : "border-line hover:bg-paper-2/60",
                        )}
                      >
                        {index === 0 ? (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                            <Store className="size-4" />
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                              customerAvatarColor(index),
                            )}
                          >
                            {customerInitials(c.name)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">
                            {c.name}
                          </p>
                          <p
                            className={cn(
                              "text-[11px] font-medium",
                              customerDueTone(c),
                            )}
                          >
                            Due {formatINR(c.outstandingDue)}
                          </p>
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={openNewCustomerForm}
                      className="flex min-w-[132px] items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-white px-3 py-2.5 text-sm font-medium text-[#2563EB] shadow-soft transition-colors hover:bg-paper-2/60"
                    >
                      <Plus className="size-4" />
                      New
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}

        {!q.trim() ? (
          <div>
            <p className="bill-quick-add-label">Quick Add</p>
            <div className="bill-quick-add-row">
              {shopCatalog.quickItems.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => void ensureQuickItem(item)}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[16px] border border-line bg-white px-3 text-xs font-medium text-ink shadow-soft hover:bg-paper-2"
                >
                  <span className="text-base leading-none" aria-hidden>
                    {quickItemIcon(item.name)}
                  </span>
                  {item.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {!q.trim() && categoryChips.length > 0 ? (
          <div className="bill-category-row">
            <div className="bill-category-scroll">
              {categoryChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setCategoryFilter(chip)}
                  className={cn(
                    "bill-category-chip text-sm font-medium transition-colors",
                    categoryFilter === chip
                      ? "bg-forest text-white shadow-soft"
                      : "border border-line bg-white text-ink hover:bg-paper-2",
                  )}
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {showEmptySearch ? (
          <Surface className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted">
              “{q}” nahi mila — Add & Sell?
            </p>
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                setDialogName(q.trim());
                setDialogOpen(true);
              }}
            >
              + Add “{q.trim()}”
            </Button>
          </Surface>
        ) : null}
        </div>

        <div className="bill-main-scroll">
          {!q.trim() && catalog.length > 0 ? (
            <div className="bill-products-toolbar">
              <h3>
                {categoryFilter === "All"
                  ? "All Products"
                  : `${categoryFilter} Products`}
              </h3>
              <div className="flex shrink-0 items-center gap-2">
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as "popular" | "name" | "price")
                  }
                  className="h-8 rounded-full border border-line bg-white px-2.5 text-xs text-ink shadow-soft"
                >
                  <option value="popular">Sort by: Popular</option>
                  <option value="name">Sort by: Name</option>
                  <option value="price">Sort by: Price</option>
                </select>
                <div className="flex rounded-full border border-line bg-white p-0.5 shadow-soft">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full",
                      viewMode === "grid"
                        ? "bg-forest text-white"
                        : "text-ink-muted hover:bg-paper-2",
                    )}
                    aria-label="Grid view"
                  >
                    <LayoutGrid className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full",
                      viewMode === "list"
                        ? "bg-forest text-white"
                        : "text-ink-muted hover:bg-paper-2",
                    )}
                    aria-label="List view"
                  >
                    <List className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {catalogLoading && catalog.length === 0 ? (
            <PageLoader />
          ) : catalog.length === 0 && !q.trim() ? (
            <EmptyState
              title="Abhi products nahi"
              description="Pehle Products page se add karo, phir yahan tap-tap bill banao."
              actionLabel="Products pe jao"
              onAction={() => navigate("/products")}
            />
          ) : viewMode === "grid" ? (
            <ul className="bill-product-grid">
              {filteredCatalog.map((p) => {
                const qty = qtyInCart.get(p._id) ?? 0;
                const flashed = flashId === p._id;
                const plan = isLooseProduct(p) ? resolveLooseSale(p) : null;
                const badge = unitLabel(plan?.billingUnit ?? p.unit).toUpperCase();
                const stock = stockStatus(p);
                const outOfStock = isProductOutOfStock(p);
                return (
                  <li key={p._id} className="min-w-0">
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => selectProduct(p)}
                      className={cn(
                        "bill-product-card group relative border bg-white shadow-soft transition-all",
                        outOfStock
                          ? "cursor-not-allowed opacity-70"
                          : "active:scale-[0.99]",
                        !outOfStock && qty > 0
                          ? "border-forest ring-2 ring-forest/15"
                          : !outOfStock
                            ? "border-line/80 hover:border-forest/30"
                            : "border-line/60",
                        flashed && !outOfStock && "bg-success-soft/40",
                      )}
                    >
                      <div className="bill-product-media">
                        <ProductThumb
                          name={p.name}
                          unit={p.unit}
                          imageUrl={p.imageUrl}
                          className="bill-product-thumb [&_img]:max-h-full [&_img]:max-w-full [&_img]:object-contain"
                        />
                        <span className="bill-product-badge">{badge}</span>
                      </div>
                      <div className="bill-product-body">
                        <p className="bill-product-name">{p.name}</p>
                        <p className="bill-product-price">
                          {plan ? (
                            <>
                              {formatINR(plan.pricePerBillingUnit)}
                              <span className="font-sans text-xs font-medium text-ink-muted">
                                {" "}
                                / {plan.billingUnit}
                              </span>
                            </>
                          ) : (
                            formatINR(p.sellingPrice)
                          )}
                        </p>
                        <div className="bill-product-foot">
                          <p className="bill-product-stock">
                            {outOfStock ? (
                              <span className="font-semibold uppercase text-danger">
                                Out of Stock
                              </span>
                            ) : stock.count != null ? (
                              <>Stock: {stock.count}</>
                            ) : (
                              <>Stock: —</>
                            )}
                          </p>
                          <span
                            className={cn(
                              "bill-product-add-btn",
                              outOfStock
                                ? "bg-line text-ink-muted"
                                : "bg-forest text-white",
                            )}
                          >
                            {qty > 0 ? (
                              <span className="text-[10px] font-bold">
                                {plan
                                  ? formatLooseQty(
                                      plan.toBillingQty(qty),
                                      plan.billingUnit,
                                    )
                                  : qty}
                              </span>
                            ) : (
                              <Plus className="size-4" strokeWidth={2.5} />
                            )}
                          </span>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-2">
              {filteredCatalog.map((p) => {
                const qty = qtyInCart.get(p._id) ?? 0;
                const flashed = flashId === p._id;
                const plan = isLooseProduct(p) ? resolveLooseSale(p) : null;
                const stock = stockStatus(p);
                const outOfStock = isProductOutOfStock(p);
                return (
                  <li key={p._id}>
                    <button
                      type="button"
                      disabled={outOfStock}
                      onClick={() => selectProduct(p)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-2xl border bg-white p-2.5 text-left shadow-soft transition-all",
                        outOfStock
                          ? "cursor-not-allowed opacity-70"
                          : "active:scale-[0.99]",
                        !outOfStock && qty > 0
                          ? "border-forest ring-2 ring-forest/15"
                          : !outOfStock
                            ? "border-line/80 hover:border-forest/35"
                            : "border-line/60",
                        flashed && !outOfStock && "bg-success-soft",
                      )}
                    >
                      <ProductThumb
                        name={p.name}
                        unit={p.unit}
                        imageUrl={p.imageUrl}
                        className="size-14 shrink-0 rounded-xl"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {p.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                              stock.tone,
                            )}
                          >
                            {stock.label}
                          </span>
                          {stock.count != null ? (
                            <span className="text-[10px] text-ink-muted">
                              Stock: {stock.count}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 font-display text-sm font-semibold text-forest">
                          {plan
                            ? `${formatINR(plan.pricePerBillingUnit)} / ${plan.billingUnit}`
                            : formatINR(p.sellingPrice)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "flex size-8 shrink-0 items-center justify-center rounded-full",
                          outOfStock
                            ? "bg-line text-ink-muted"
                            : "bg-forest text-white",
                        )}
                      >
                        {qty > 0 ? (
                          <span className="text-[11px] font-bold">
                            {plan
                              ? formatLooseQty(
                                  plan.toBillingQty(qty),
                                  plan.billingUnit,
                                )
                              : qty}
                          </span>
                        ) : (
                          <Plus className="size-4" strokeWidth={2.5} />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {searching ? (
            <p className="mt-2 text-center text-xs text-ink-muted">
              Searching…
            </p>
          ) : null}
        </div>

        <div className="bill-main-footer">
        <div className="bill-tips-bar bg-amber-50/90">
          <span className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-ink">
            <Zap className="size-3.5 text-ink-muted" />
            Fast Billing Tips:
          </span>
          {BILL_TIPS_INLINE.map((tip) => (
            <span
              key={tip}
              className="inline-flex shrink-0 items-center gap-1 text-ink-muted"
            >
              <Check
                className="size-3 shrink-0 text-success"
                strokeWidth={2.5}
              />
              {tip}
            </span>
          ))}
        </div>

        <div className="bill-recent-customers">
          <p className="mb-1.5 text-sm font-bold text-ink">Recent Customers</p>
          <div className="bill-recent-scroll">
            {recentCustomers.length > 0 ? (
              recentCustomers.slice(0, 6).map((c, index) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => setSelectedCustomer(c)}
                  className={cn(
                    "bill-recent-card flex items-center gap-2.5 border bg-white text-left transition-colors hover:bg-paper-2/60",
                    selectedCustomer?._id === c._id
                      ? "border-forest ring-1 ring-forest/20"
                      : "border-line",
                  )}
                >
                  {index === 0 ? (
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                      <Store className="size-3.5" />
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        customerAvatarColor(index),
                      )}
                    >
                      {customerInitials(c.name)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-ink">
                      {c.name}
                    </p>
                    <p
                      className={cn(
                        "text-[11px] font-medium",
                        customerDueTone(c),
                      )}
                    >
                      Due {formatINR(c.outstandingDue)}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <p className="text-sm text-ink-muted">No customers yet</p>
            )}
            <button
              type="button"
              onClick={openNewCustomerForm}
              className="bill-recent-card flex min-w-[152px] items-center justify-center gap-1 border border-line bg-white text-sm font-medium text-[#2563EB] transition-colors hover:bg-paper-2/60"
            >
              <Plus className="size-4" />
              New Customer
            </button>
          </div>
        </div>
        </div>
      </div>

      {(() => {
        const cartNode = (
          <>
            {mobileCartOpen ? (
              <button
                type="button"
                className="fixed inset-0 z-[65] bg-ink/45 lg:hidden"
                aria-label="Close cart"
                onClick={() => setMobileCartOpen(false)}
              />
            ) : null}
            <Surface
              padded={false}
              className={cn(
                "bill-cart !flex !min-h-0 !flex-col !rounded-[14px] !border-line !bg-white",
                mobileCartOpen ? "bill-cart--sheet" : "max-lg:!hidden",
              )}
              style={
                mobileCartOpen
                  ? {
                      position: "fixed",
                      left: 0,
                      right: 0,
                      top: mobileCartTop,
                      bottom: 0,
                      zIndex: 70,
                      width: "100%",
                      maxWidth: "100%",
                      minWidth: 0,
                      height: "auto",
                      maxHeight: "none",
                      margin: 0,
                      borderRadius: "1.5rem 1.5rem 0 0",
                      alignSelf: "auto",
                      backgroundColor: "#fff",
                    }
                  : undefined
              }
            >
        {mobileCartOpen ? (
          <div className="flex justify-center pt-2 lg:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-line" />
          </div>
        ) : null}
        <div
          className={cn(
            "bill-cart-header",
            !mobileCartOpen && "bg-forest",
          )}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h2
              className={cn(
                "text-lg font-bold",
                mobileCartOpen ? "text-ink" : "text-white",
              )}
            >
              Cart{cart.length > 0 ? ` (${cart.length})` : ""}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {cart.length > 0 ? (
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-sm font-semibold",
                  mobileCartOpen
                    ? "text-danger hover:bg-danger-soft"
                    : "text-white/90 hover:text-white",
                )}
                onClick={clearCart}
              >
                <Trash2 className="size-3.5" />
                Clear
              </button>
            ) : null}
            {mobileCartOpen ? (
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-xl bg-paper-2 text-ink-muted lg:hidden"
                aria-label="Close cart"
                onClick={() => setMobileCartOpen(false)}
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="bill-cart-customer">
          <button
            type="button"
            className="flex w-full items-start gap-2.5 rounded-xl border border-line bg-white px-3 py-2.5 text-left shadow-soft"
            onClick={openCustomerPicker}
            aria-expanded={cartCustomerOpen}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-semibold text-white">
              {selectedCustomer
                ? customerInitials(selectedCustomer.name)
                : "W"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="truncate text-sm font-semibold text-ink">
                  {selectedCustomer?.name ?? "Walk-in Customer"}
                </p>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-ink-muted transition-transform",
                    cartCustomerOpen && "rotate-180",
                  )}
                />
              </div>
              <p className="text-xs text-ink-muted">
                {selectedCustomer
                  ? "Customer selected"
                  : "Add or select customer"}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] text-ink-muted">Outstanding</p>
              <p className="text-sm font-bold text-forest">
                {formatINR(selectedCustomer?.outstandingDue ?? 0)}
              </p>
            </div>
          </button>
        </div>

        {cartCustomerOpen ? (
          <div
            className="bill-cart-customer-menu"
            role="listbox"
            aria-label="Select customer"
          >
            {newCustomerMode ? (
              <form
                className="flex h-full flex-col gap-2.5 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void saveNewCartCustomer();
                }}
              >
                <p className="text-sm font-semibold text-ink">New customer</p>
                <Input
                  label="Name"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  required
                  autoFocus
                  placeholder="Customer name"
                  className="!h-10"
                />
                <Input
                  label="Phone (optional)"
                  value={newCustomerPhone}
                  onChange={(e) =>
                    setNewCustomerPhone(
                      e.target.value.replace(/\D/g, "").slice(0, 10),
                    )
                  }
                  placeholder="10-digit mobile"
                  inputMode="numeric"
                  className="!h-10"
                />
                {newCustomerError ? (
                  <p className="text-xs text-danger">{newCustomerError}</p>
                ) : null}
                <div className="mt-auto flex gap-2 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    fullWidth
                    onClick={() => {
                      setNewCustomerMode(false);
                      setNewCustomerName("");
                      setNewCustomerPhone("");
                      setNewCustomerError(null);
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    fullWidth
                    loading={newCustomerSaving}
                    disabled={!newCustomerName.trim()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    Save
                  </Button>
                </div>
              </form>
            ) : (
              <div className="py-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-forest hover:bg-paper-2"
                  onClick={() => {
                    setNewCustomerMode(true);
                    setNewCustomerError(null);
                  }}
                >
                  <span className="flex size-7 items-center justify-center rounded-full border border-dashed border-forest/40 bg-forest/5 text-forest">
                    <Plus className="size-3.5" />
                  </span>
                  <span className="font-semibold">New customer</span>
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-paper-2"
                  onClick={() => {
                    setSelectedCustomer(null);
                    closeCartCustomerPicker();
                  }}
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-forest text-[10px] font-bold text-white">
                    W
                  </span>
                  <span className="font-medium">Walk-in Customer</span>
                </button>
                {recentCustomers.slice(0, 20).map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-paper-2"
                    onClick={() => {
                      setSelectedCustomer(c);
                      closeCartCustomerPicker();
                    }}
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-paper-2 text-[10px] font-bold text-ink">
                      {customerInitials(c.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {c.name}
                    </span>
                    {c.outstandingDue > 0 ? (
                      <span className="shrink-0 text-xs text-orange-700">
                        Due {formatINR(c.outstandingDue)}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
        <div
          className={cn("bill-cart-items", cart.length === 0 && "is-empty")}
        >
          {cart.length === 0 ? (
            <p className="text-center text-sm text-ink-muted">
              Cart khali hai — products tap karo
            </p>
          ) : (
            <>
              <ul className="divide-y divide-line/40">
                {cart.map((line) => {
                  const plan = resolveLooseSale({
                    name: line.name,
                    unit: line.unit || "piece",
                    sellingPrice: line.unitPrice,
                  });
                  const loose = plan.loose;
                  const billingQty = plan.toBillingQty(line.quantity);
                  const lineTotal =
                    Math.round(line.unitPrice * line.quantity * 100) / 100;
                  const variant = unitLabel(line.unit);
                  const qtyDisplay = loose
                    ? formatLooseQty(billingQty, plan.billingUnit)
                    : String(line.quantity);
                  const openWeightEdit = () => {
                    const product =
                      catalog.find((p) => p._id === line.productId) ??
                      favorites.find((p) => p._id === line.productId) ?? {
                        _id: line.productId,
                        shopId: shopId!,
                        name: line.name,
                        sellingPrice: line.unitPrice,
                        trackStock: line.trackStock,
                        isFavorite: false,
                        active: true,
                        availableStock: null,
                        unit: line.unit || "piece",
                        imageUrl: line.imageUrl,
                      };
                    setWeightPick({
                      product,
                      mode: "edit",
                      initialQty: resolveLooseSale(product).toBillingQty(
                        line.quantity,
                      ),
                    });
                  };
                  return (
                    <li key={line.productId} className="py-2.5">
                      <div className="bill-cart-line-row">
                        <ProductThumb
                          name={line.name}
                          unit={line.unit}
                          imageUrl={line.imageUrl}
                          className="size-12 shrink-0 rounded-lg"
                        />
                        <div className="bill-cart-line-main">
                          <p className="bill-cart-line-name truncate">
                            {line.name}
                            {variant ? (
                              <span className="font-normal text-ink-muted">
                                {" "}
                                ({variant})
                              </span>
                            ) : null}
                          </p>
                          {loose ? (
                            <div className="bill-cart-line-qty">
                              <button
                                type="button"
                                className="flex size-7 items-center justify-center rounded hover:bg-paper-2"
                                aria-label="Edit weight"
                                onClick={openWeightEdit}
                              >
                                <Minus className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                className="min-w-10 px-0.5 text-center text-xs font-semibold hover:text-forest"
                                onClick={openWeightEdit}
                              >
                                {qtyDisplay}
                              </button>
                              <button
                                type="button"
                                className="flex size-7 items-center justify-center rounded hover:bg-paper-2"
                                aria-label="Edit weight"
                                onClick={openWeightEdit}
                              >
                                <Plus className="size-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="bill-cart-line-qty">
                              <button
                                type="button"
                                className="flex size-7 items-center justify-center rounded hover:bg-paper-2"
                                onClick={() => bumpQty(line.productId, -1)}
                                aria-label="Decrease"
                              >
                                <Minus className="size-3.5" />
                              </button>
                              <span className="w-5 text-center text-xs font-semibold">
                                {line.quantity}
                              </span>
                              <button
                                type="button"
                                className="flex size-7 items-center justify-center rounded hover:bg-paper-2"
                                onClick={() => bumpQty(line.productId, 1)}
                                aria-label="Increase"
                              >
                                <Plus className="size-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                        <div className="bill-cart-line-actions">
                          <p className="bill-cart-line-total">
                            {formatINR(lineTotal)}
                          </p>
                          <button
                            type="button"
                            className="bill-cart-line-remove"
                            aria-label="Remove"
                            onClick={() => removeLine(line.productId)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {noteOpen ? (
                <input
                  className="mt-2 h-10 w-full rounded-xl border border-line bg-white px-3 text-sm"
                  placeholder="Item note..."
                  value={billNote}
                  onChange={(e) => setBillNote(e.target.value)}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="bill-cart-note-btn"
                  onClick={() => setNoteOpen(true)}
                >
                  <Pencil className="size-3.5" />
                  Add Item Note
                </button>
              )}
            </>
          )}
        </div>
        )}

        <div className="bill-cart-footer">
          {(() => {
            const subtotalRow = (
              <div className="bill-cart-footer-row">
                <span>Subtotal</span>
                <span className="bill-cart-footer-value">
                  {formatINR(itemsTotal)}
                </span>
              </div>
            );
            const discountRow = !discountOpen ? (
              <div className="bill-cart-footer-row">
                <span>Discount</span>
                <div className="flex items-center gap-2">
                  {discountAmount > 0 ? (
                    <>
                      <span className="bill-cart-footer-value text-forest">
                        −{formatINR(discountAmount)}
                        <span className="ml-1 text-[11px] font-medium text-ink-muted">
                          ({discountPercent}%)
                        </span>
                      </span>
                      <button
                        type="button"
                        className="text-xs font-semibold text-forest hover:underline"
                        onClick={() => {
                          setDiscountInput(
                            discountPercent > 0
                              ? String(discountPercent)
                              : "",
                          );
                          setDiscountOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-danger hover:underline"
                        onClick={() => {
                          setDiscountPercent(0);
                          setDiscountInput("");
                        }}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="text-xs font-semibold text-forest hover:underline"
                      onClick={() => {
                        setDiscountInput("");
                        setDiscountOpen(true);
                      }}
                    >
                      Apply
                    </button>
                  )}
                </div>
              </div>
            ) : null;
            const cgstRow =
              gstAmount > 0 ? (
                <div className="bill-cart-footer-row is-tax">
                  <span>CGST ({gstRate / 2}%)</span>
                  <span className="bill-cart-footer-value">
                    {formatINR(gstAmount / 2)}
                  </span>
                </div>
              ) : null;
            const sgstRow =
              gstAmount > 0 ? (
                <div className="bill-cart-footer-row is-tax">
                  <span>SGST ({gstRate / 2}%)</span>
                  <span className="bill-cart-footer-value">
                    {formatINR(gstAmount / 2)}
                  </span>
                </div>
              ) : null;
            const roundOffRow =
              Math.abs(roundOff) >= 0.01 ? (
                <div className="bill-cart-footer-row">
                  <span>Round Off</span>
                  <span className="bill-cart-footer-value">
                    {roundOff > 0 ? "+" : ""}
                    {formatINR(roundOff)}
                  </span>
                </div>
              ) : null;

            return (
              <>
                <div className="bill-cart-footer-rows is-compact">
                  {subtotalRow}
                  {cgstRow}
                  {sgstRow}
                  {discountRow}
                  {roundOffRow}
                </div>
                {discountOpen ? (
                  <div className="bill-cart-discount-editor">
                    <label
                      className="bill-cart-discount-editor-label"
                      htmlFor="bill-discount-pct"
                    >
                      Discount %
                    </label>
                    <div className="bill-cart-discount-editor-field">
                      <input
                        id="bill-discount-pct"
                        autoFocus
                        inputMode="decimal"
                        type="text"
                        className="bill-cart-discount-input"
                        placeholder="0"
                        value={discountInput}
                        onChange={(e) =>
                          setDiscountInput(
                            e.target.value.replace(/[^\d.]/g, ""),
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            applyDiscountPercent();
                          }
                          if (e.key === "Escape") setDiscountOpen(false);
                        }}
                        aria-label="Discount percent"
                      />
                      <span className="bill-cart-discount-suffix" aria-hidden>
                        %
                      </span>
                    </div>
                    <button
                      type="button"
                      className="bill-cart-discount-ok"
                      onClick={applyDiscountPercent}
                    >
                      Apply
                    </button>
                    <button
                      type="button"
                      className="bill-cart-discount-cancel"
                      onClick={() => setDiscountOpen(false)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
              </>
            );
          })()}

          <div className="bill-cart-grand-total">
            <span>Grand Total</span>
            <span>{formatINR(chargeTotal)}</span>
          </div>

          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              Payment Method
            </p>
            <div className="bill-cart-pay-grid">
              <button
                type="button"
                disabled={!canPay}
                onClick={() => {
                  setPayError(null);
                  setActivePayMethod("CASH");
                }}
                className={cn(
                  "flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-semibold disabled:opacity-40",
                  activePayMethod === "CASH"
                    ? "border-forest bg-forest text-white"
                    : "border-forest/25 bg-forest/10 text-forest",
                )}
              >
                <Banknote className="size-4" />
                Cash
              </button>
              <button
                type="button"
                disabled={!canPay}
                onClick={() => {
                  setPayError(null);
                  setActivePayMethod("UPI");
                }}
                className={cn(
                  "flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-semibold disabled:opacity-40",
                  activePayMethod === "UPI"
                    ? "border-[#2563EB] bg-[#2563EB] text-white"
                    : "border-[#3B82F6]/30 bg-[#3B82F6]/10 text-[#2563EB]",
                )}
              >
                <Smartphone className="size-4" />
                UPI
              </button>
              <button
                type="button"
                disabled={!canPay}
                onClick={() => {
                  setPayError(null);
                  setActivePayMethod("CREDIT");
                }}
                className={cn(
                  "flex h-11 flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-semibold disabled:opacity-40",
                  activePayMethod === "CREDIT"
                    ? "border-[#6D28D9] bg-[#6D28D9] text-white"
                    : "border-[#7C3AED]/25 bg-[#7C3AED]/10 text-[#6D28D9]",
                )}
              >
                <HandCoins className="size-4" />
                Udhaar
              </button>
            </div>
          </div>

          {payError ? (
            <p className="text-sm text-danger">{payError}</p>
          ) : null}

          <Button
            variant="primary"
            fullWidth
            size="lg"
            disabled={
              !canPay ||
              paying ||
              cartCustomerOpen ||
              newCustomerMode ||
              newCustomerSaving
            }
            loading={paying}
            onClick={handleCreateBill}
            className="bill-cart-create-btn"
          >
            <span>Create Bill</span>
            <span>{canPay ? `${formatINR(chargeTotal)} →` : "→"}</span>
          </Button>
        </div>
      </Surface>
          </>
        );
        return mobileCartOpen
          ? createPortal(cartNode, document.body)
          : cartNode;
      })()}

      {cart.length > 0 && !mobileCartOpen && !weightPick ? (
        <div className="bill-mobile-cart-bar fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] z-50 lg:hidden">
          <div className="flex h-[52px] items-center justify-between gap-3 bg-[#0d3d2a] px-4">
            <p className="min-w-0 truncate text-sm font-semibold text-white">
              {cart.length} {cart.length === 1 ? "item" : "items"} ·{" "}
              {formatINR(total)}
            </p>
            <button
              type="button"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#2f9e6a] px-4 text-sm font-bold text-white"
              onClick={() => setMobileCartOpen(true)}
            >
              View cart
              <ArrowRight className="size-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ) : null}
    </div>

    <QuickAddDialog
        shopId={shopId}
        businessType={activeShop?.businessType}
        open={dialogOpen}
        initialName={dialogName}
        title="Add & Sell"
        submitLabel="Add & Sell"
        onClose={() => setDialogOpen(false)}
        onCreated={(product) => {
          selectProduct(product);
          void loadFavorites();
        }}
      />

      {weightPick ? (
        <WeightPickerSheet
          open
          productName={weightPick.product.name}
          unit={resolveLooseSale(weightPick.product).billingUnit}
          unitPrice={resolveLooseSale(weightPick.product).pricePerBillingUnit}
          mode={weightPick.mode}
          initialQty={weightPick.initialQty}
          onClose={() => setWeightPick(null)}
          onConfirm={(billingQty) => {
            const plan = resolveLooseSale(weightPick.product);
            const stockQty = plan.toStockQty(billingQty);
            if (weightPick.mode === "edit") {
              setCartQty(weightPick.product._id, stockQty);
              flashProduct(weightPick.product._id);
            } else {
              addToCart(weightPick.product, stockQty);
            }
            setWeightPick(null);
          }}
        />
      ) : null}

      {payMethod ? (
        <PaymentSheet
          open
          method={payMethod}
          total={total}
          loading={paying}
          error={payError}
          onClose={() => setPayMethod(null)}
          onConfirm={(p) => void completeSale(p)}
        />
      ) : null}
    </>
  );
}
