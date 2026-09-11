import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  Info,
  Pencil,
  Plus,
  Search,
  ShoppingBag,
  ShoppingCart,
  Trash2,
  Wallet,
  X,
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

type SortKey =
  | "name-asc"
  | "name-desc"
  | "stock-asc"
  | "stock-desc"
  | "value-desc";

type CategoryOption = { _id: string; name: string };
type Supplier = { _id: string; name: string; phone: string | null };
type PurchaseRow = {
  _id: string;
  supplierName: string | null;
  total: number;
  purchasedAt: string | null;
  itemCount: number;
  items: { name: string; quantity: number }[];
};

type PaymentMode = "Cash" | "UPI" | "Credit";

type StockOutReason =
  | "Damage / Wastage"
  | "Expired"
  | "Personal use"
  | "Stock correction";

const PAGE_SIZE = 10;
const UNITS = ["piece", "pack", "kg", "g", "L", "ml", "dozen", "box"] as const;
const STOCK_OUT_REASONS: StockOutReason[] = [
  "Damage / Wastage",
  "Expired",
  "Personal use",
  "Stock correction",
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

function formatBillDate(iso?: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** UI rule: 0 = out, < 3 = low, else in stock */
function displayStatus(item: Pick<StockItem, "availableStock">): StockStatus {
  if (item.availableStock <= 0) return "out";
  if (item.availableStock < 3) return "low";
  return "ok";
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

function lastCost(item: StockItem) {
  return item.purchasePrice ?? null;
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

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-semibold text-ink-muted">
      {children}
    </label>
  );
}

function SoftInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border-0 bg-[#f3f4f6] px-3 text-sm text-ink outline-none ring-forest/30 placeholder:text-ink-muted/70 focus:ring-2",
        className,
      )}
      {...props}
    />
  );
}

function SoftSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { className?: string }) {
  return (
    <select
      className={cn(
        "h-11 w-full appearance-none rounded-xl border-0 bg-[#f3f4f6] px-3 text-sm text-ink outline-none ring-forest/30 focus:ring-2",
        className,
      )}
      {...props}
    >
      {children}
    </select>
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

function AddStockModal({
  shopId,
  items,
  categories,
  suppliers,
  preselected,
  onClose,
  onSaved,
}: {
  shopId: string;
  items: StockItem[];
  categories: CategoryOption[];
  suppliers: Supplier[];
  preselected: StockItem | null;
  onClose: () => void;
  onSaved: (result: {
    total: number;
    countedAsKharcha: boolean;
    notice?: string;
  }) => void;
}) {
  const [tab, setTab] = useState<"existing" | "new">(
    preselected ? "existing" : "existing",
  );
  const [productQuery, setProductQuery] = useState(preselected?.name ?? "");
  const [selectedId, setSelectedId] = useState(preselected?.productId ?? "");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState(
    preselected?.purchasePrice != null
      ? String(preselected.purchasePrice)
      : "",
  );
  const [supplierId, setSupplierId] = useState(suppliers[0]?._id ?? "");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Cash");
  const [billNo, setBillNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(todayInputValue());
  const [newName, setNewName] = useState("");
  const [newCategoryId, setNewCategoryId] = useState(categories[0]?._id ?? "");
  const [newUnit, setNewUnit] = useState<string>("piece");
  const [sellingPrice, setSellingPrice] = useState("");
  const [reorderLevel, setReorderLevel] = useState("5");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (preselected) {
      setTab("existing");
      setSelectedId(preselected.productId);
      setProductQuery(preselected.name);
      if (preselected.purchasePrice != null) {
        setUnitCost(String(preselected.purchasePrice));
      }
    }
  }, [preselected]);

  useEffect(() => {
    if (!supplierId && suppliers[0]?._id) setSupplierId(suppliers[0]._id);
  }, [suppliers, supplierId]);

  const matches = useMemo(() => {
    const needle = productQuery.trim().toLowerCase();
    if (!needle) return items.slice(0, 8);
    return items
      .filter((i) => i.name.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [items, productQuery]);

  const selected = items.find((i) => i.productId === selectedId) ?? null;
  const totalCost =
    Math.max(0, Number(qty) || 0) * Math.max(0, Number(unitCost) || 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const quantity = Number(qty);
    const cost = Number(unitCost);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantity sahi daalo");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      setError("Cost price sahi daalo");
      return;
    }

    setSaving(true);
    try {
      let productId = selectedId;

      if (tab === "new") {
        if (!newName.trim()) {
          setError("Product name likho");
          setSaving(false);
          return;
        }
        const sell = Number(sellingPrice);
        if (!Number.isFinite(sell) || sell < 0) {
          setError("Selling price sahi daalo");
          setSaving(false);
          return;
        }
        const created = await api<{ product: { _id: string } }>(
          `/api/shops/${shopId}/products`,
          {
            method: "POST",
            body: JSON.stringify({
              name: newName.trim(),
              categoryId: newCategoryId || undefined,
              unit: newUnit,
              sellingPrice: sell,
              purchasePrice: cost,
              trackStock: true,
              minStock: Math.max(0, Math.floor(Number(reorderLevel) || 0)),
              openingStock: 0,
              force: true,
            }),
          },
        );
        productId = created.product._id;
      } else if (!productId) {
        setError("Pehle product select karo");
        setSaving(false);
        return;
      }

      const noteParts = [
        `Payment: ${paymentMode}`,
        billNo.trim() ? `Bill: ${billNo.trim()}` : null,
        purchaseDate ? `Date: ${purchaseDate}` : null,
        "From Inventory Add stock",
      ].filter(Boolean);

      await api(`/api/shops/${shopId}/purchases`, {
        method: "POST",
        body: JSON.stringify({
          supplierId: supplierId || undefined,
          note: noteParts.join(" · "),
          purchasedAt: purchaseDate
            ? new Date(`${purchaseDate}T12:00:00`).toISOString()
            : undefined,
          items: [{ productId, quantity, unitCost: cost }],
        }),
      });

      let countedAsKharcha = false;
      if (paymentMode !== "Credit" && totalCost > 0) {
        const payMethod =
          paymentMode === "UPI" ? "UPI" : ("CASH" as const);
        try {
          await api(`/api/shops/${shopId}/expenses`, {
            method: "POST",
            body: JSON.stringify({
              category: "Stock Purchase",
              amount: Math.round(totalCost * 100) / 100,
              paymentMethod: payMethod,
              note: [
                tab === "new" ? newName.trim() : selected?.name,
                billNo.trim() ? `Bill ${billNo.trim()}` : null,
              ]
                .filter(Boolean)
                .join(" · "),
              spentAt: purchaseDate
                ? new Date(`${purchaseDate}T12:00:00`).toISOString()
                : undefined,
            }),
          });
          countedAsKharcha = true;
        } catch (expErr) {
          onSaved({
            total: totalCost,
            countedAsKharcha: false,
            notice:
              expErr instanceof ApiRequestError
                ? `Stock save ho gaya, lekin Kharcha fail: ${expErr.body.message}`
                : "Stock save ho gaya, lekin Kharcha entry nahi bani",
          });
          onClose();
          setSaving(false);
          return;
        }
      }

      onSaved({ total: totalCost, countedAsKharcha });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Add stock fail hua",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Add stock"
    >
      <form
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-soft"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-xl font-semibold text-ink">
            Add stock
          </h2>
          <button
            type="button"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-paper-2"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f3f4f6] p-1">
            <button
              type="button"
              className={cn(
                "rounded-lg py-2.5 text-sm font-semibold transition-colors",
                tab === "existing"
                  ? "bg-white text-ink shadow-soft"
                  : "text-ink-muted",
              )}
              onClick={() => setTab("existing")}
            >
              Existing product
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg py-2.5 text-sm font-semibold transition-colors",
                tab === "new"
                  ? "bg-white text-ink shadow-soft"
                  : "text-ink-muted",
              )}
              onClick={() => setTab("new")}
            >
              + New product
            </button>
          </div>

          {tab === "new" ? (
            <div className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
              ✨ Yeh product pehli baar add ho raha hai
            </div>
          ) : null}

          {tab === "existing" ? (
            <div>
              <FieldLabel>Search product</FieldLabel>
              <SoftInput
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setSelectedId("");
                }}
                placeholder="Product ka naam type karein..."
                autoFocus={!preselected}
              />
              {productQuery.trim() && !selectedId ? (
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-line bg-white">
                  {matches.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-ink-muted">
                      Koi product nahi mila
                    </li>
                  ) : (
                    matches.map((m) => (
                      <li key={m.productId}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-paper-2"
                          onClick={() => {
                            setSelectedId(m.productId);
                            setProductQuery(m.name);
                            if (m.purchasePrice != null) {
                              setUnitCost(String(m.purchasePrice));
                            }
                          }}
                        >
                          <ProductThumb item={m} />
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {m.name}
                          </span>
                          <span className="text-xs text-ink-muted">
                            Stock {m.availableStock}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
              {selected ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Selected:{" "}
                  <span className="font-semibold text-ink">{selected.name}</span>{" "}
                  · abhi {selected.availableStock} {selected.unit}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <FieldLabel>Product name</FieldLabel>
                <SoftInput
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Frozen Peas 500g"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Category</FieldLabel>
                  <SoftSelect
                    value={newCategoryId}
                    onChange={(e) => setNewCategoryId(e.target.value)}
                  >
                    <option value="">Select</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c._id}>
                        {categoryArtFor(c.name, "piece").emoji} {c.name}
                      </option>
                    ))}
                  </SoftSelect>
                </div>
                <div>
                  <FieldLabel>Unit</FieldLabel>
                  <SoftSelect
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>
                        {u.toUpperCase()}
                      </option>
                    ))}
                  </SoftSelect>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel>Selling price (₹)</FieldLabel>
                  <SoftInput
                    inputMode="decimal"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    placeholder="Customer se kitna loge"
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Reorder level</FieldLabel>
                  <SoftInput
                    inputMode="numeric"
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-dashed border-line pt-4">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-ink-muted">
              Purchase details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Quantity purchased</FieldLabel>
                <SoftInput
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                />
              </div>
              <div>
                <FieldLabel>Cost price / unit (₹)</FieldLabel>
                <SoftInput
                  inputMode="decimal"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="Aapko kitne mein mila"
                  required
                />
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              <span>Total purchase cost</span>
              <span>{formatINR(totalCost)}</span>
            </div>
          </div>

          <div>
            <FieldLabel>Supplier</FieldLabel>
            <SoftSelect
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </SoftSelect>
          </div>

          <div>
            <FieldLabel>Payment mode</FieldLabel>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-[#f3f4f6] p-1">
              {(["Cash", "UPI", "Credit"] as PaymentMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "rounded-lg py-2.5 text-xs font-semibold transition-colors sm:text-sm",
                    paymentMode === mode
                      ? "bg-[#1a1c2e] text-white shadow-soft"
                      : "text-ink-muted",
                  )}
                  onClick={() => setPaymentMode(mode)}
                >
                  {mode === "Credit" ? "Credit (Udhaar)" : mode}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Supplier&apos;s bill no. (optional)</FieldLabel>
              <SoftInput
                value={billNo}
                onChange={(e) => setBillNo(e.target.value)}
                placeholder="e.g. INV-2245"
              />
            </div>
            <div>
              <FieldLabel>Date</FieldLabel>
              <SoftInput
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2.5 rounded-xl bg-slate-100 px-3 py-3 text-sm text-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <p>
              Save karte hi is amount ka ek entry{" "}
              <strong>Kharcha</strong> mein automatically ban jaayegi, category
              &apos;Stock Purchase&apos; ke saath
              {paymentMode === "Credit" ? " (Credit pe baad mein)." : "."}
            </p>
          </div>

          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>

        <div className="flex gap-2 border-t border-line px-5 py-4">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" fullWidth loading={saving}>
            Add stock & save purchase
          </Button>
        </div>
      </form>
    </div>
  );
}

function StockOutModal({
  shopId,
  item,
  onClose,
  onSaved,
}: {
  shopId: string;
  item: StockItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<StockOutReason>("Damage / Wastage");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(qty);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setError("Quantity sahi daalo");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shops/${shopId}/inventory/adjust`, {
        method: "POST",
        body: JSON.stringify({
          productId: item.productId,
          type: "MANUAL_ADJUSTMENT_OUT",
          quantityDelta: quantity,
          note: reason,
        }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Stock out fail",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Stock out"
    >
      <form
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-soft"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">
            Stock out
          </h2>
          <button
            type="button"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-paper-2"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-red-50 px-3 py-3">
          <ProductThumb item={item} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-red-900">{item.name}</p>
            <p className="text-sm text-red-700/80">
              Current stock: {item.availableStock}
            </p>
          </div>
        </div>

        <div>
          <FieldLabel>Quantity</FieldLabel>
          <SoftInput
            inputMode="decimal"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div>
          <FieldLabel>Reason</FieldLabel>
          <SoftSelect
            className="ring-2 ring-forest/40"
            value={reason}
            onChange={(e) => setReason(e.target.value as StockOutReason)}
          >
            {STOCK_OUT_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </SoftSelect>
        </div>

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex gap-2 pt-1">
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" variant="primary" fullWidth loading={saving}>
            Confirm stock out
          </Button>
        </div>
      </form>
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [recentPurchases, setRecentPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out" | "ok">(
    "all",
  );
  const [sortKey, setSortKey] = useState<SortKey>("name-asc");
  const [page, setPage] = useState(1);
  const [addStockOpen, setAddStockOpen] = useState(false);
  const [addStockFor, setAddStockFor] = useState<StockItem | null>(null);
  const [stockOutFor, setStockOutFor] = useState<StockItem | null>(null);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [sessionKharcha, setSessionKharcha] = useState({ total: 0, count: 0 });
  const [stockNotice, setStockNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [inv, cats, supp, purchases] = await Promise.all([
        api<{ items: StockItem[]; summary: InventorySummary }>(
          `/api/shops/${shopId}/inventory`,
        ),
        api<{ categories: CategoryOption[] }>(
          `/api/shops/${shopId}/categories`,
        ).catch(() => ({ categories: [] as CategoryOption[] })),
        api<{ suppliers: Supplier[] }>(
          `/api/shops/${shopId}/suppliers`,
        ).catch(() => ({ suppliers: [] as Supplier[] })),
        api<{ purchases: PurchaseRow[] }>(
          `/api/shops/${shopId}/purchases`,
        ).catch(() => ({ purchases: [] as PurchaseRow[] })),
      ]);
      setItems(inv.items);
      setSummary(inv.summary);
      setCategories(cats.categories);
      setSuppliers(supp.suppliers);
      setRecentPurchases((purchases.purchases ?? []).slice(0, 5));
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
    const inStock = items.filter((i) => displayStatus(i) === "ok").length;
    const low = items.filter((i) => displayStatus(i) === "low").length;
    const out = items.filter((i) => displayStatus(i) === "out").length;
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
      const status = displayStatus(i);
      if (stockFilter === "low" && status !== "low") return false;
      if (stockFilter === "out" && status !== "out") return false;
      if (stockFilter === "ok" && status !== "ok") return false;
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
        .filter((i) => {
          const s = displayStatus(i);
          return s === "low" || s === "out";
        })
        .slice(0, 6),
    [items],
  );

  function openAddStock(item?: StockItem | null) {
    setAddStockFor(item ?? null);
    setAddStockOpen(true);
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
                Stock levels, purchases aur kharcha — sab jude hue.
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
                  Har stock entry ek purchase hai — cost track karein, kharcha
                  apne aap ban jaayega.
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
                onClick={() => openAddStock(null)}
              >
                Add stock
              </Button>
            </div>
          </div>

          <div className="flex gap-3 rounded-2xl border border-sky-100 bg-sky-50/80 px-4 py-3.5">
            <Info className="mt-0.5 size-5 shrink-0 text-sky-700" />
            <div className="min-w-0 text-sm text-sky-950">
              <p className="font-semibold">Add Stock = ek chhota purchase</p>
              <p className="mt-1 text-sky-900/80">
                Jab bhi stock add karte ho, woh kahin se kharida gaya hai.
                Isliye Add Stock quantity, cost price aur supplier maangta hai.
                Naya item? &quot;+ New product&quot; se create karo. Save par
                purchase bill + Kharcha (Stock Purchase) entry ban jaati hai.
              </p>
            </div>
          </div>

          {stockNotice ? (
            <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <p>{stockNotice}</p>
              <button
                type="button"
                className="shrink-0 font-semibold text-amber-800 hover:underline"
                onClick={() => setStockNotice(null)}
              >
                Dismiss
              </button>
            </div>
          ) : null}

          {loading ? (
            <PageLoader />
          ) : loadError ? (
            <EmptyState
              icon={<ShoppingBag className="size-7" />}
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
                    At cost price · {stats.totalSkus} SKUs
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
                      <AlertTriangle className="size-4" />
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
                  icon={<ShoppingBag className="size-7" />}
                  title={
                    q || categoryFilter !== "All" || stockFilter !== "all"
                      ? "Koi match nahi"
                      : "Tracked products nahi"
                  }
                  description="Products pe Track stock ON karo, ya filter badlo."
                  actionLabel="Add stock"
                  onAction={() => openAddStock(null)}
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
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Last cost</th>
                            <th className="px-4 py-3">Stock value</th>
                            <th className="px-4 py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedItems.map((item) => {
                            const cat = itemCategory(item);
                            const cost = lastCost(item);
                            const status = displayStatus(item);
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
                                      <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted">
                                        <span aria-hidden>
                                          {
                                            categoryArtFor(cat, item.unit)
                                              .emoji
                                          }
                                        </span>
                                        {cat}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-medium text-ink">
                                  {item.availableStock}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge tone={statusTone(status)}>
                                    {statusLabel(status)}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3 font-medium text-ink">
                                  {cost != null ? formatINR(cost) : "—"}
                                </td>
                                <td className="px-4 py-3 font-semibold text-ink">
                                  {formatINR(stockValue(item))}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap gap-1.5">
                                    <button
                                      type="button"
                                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                                      onClick={() => openAddStock(item)}
                                    >
                                      + Stock in
                                    </button>
                                    <button
                                      type="button"
                                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                                      onClick={() => setStockOutFor(item)}
                                    >
                                      − Stock out
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
                    {pagedItems.map((item) => {
                      const status = displayStatus(item);
                      return (
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
                            <Badge tone={statusTone(status)}>
                              {statusLabel(status)}
                            </Badge>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-ink-muted">
                              Last cost{" "}
                              {lastCost(item) != null
                                ? formatINR(lastCost(item)!)
                                : "—"}
                            </span>
                            <span className="font-semibold text-ink">
                              {formatINR(stockValue(item))}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="inline-flex h-8 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700"
                              onClick={() => openAddStock(item)}
                            >
                              + Stock in
                            </button>
                            <button
                              type="button"
                              className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700"
                              onClick={() => setStockOutFor(item)}
                            >
                              − Stock out
                            </button>
                          </div>
                        </Surface>
                      </li>
                      );
                    })}
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

            <div className="rounded-2xl border border-amber-100 bg-[#f7efe6] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-amber-950">
                    Stock Kharcha (session)
                  </p>
                  <p className="mt-2 font-display text-2xl font-semibold text-amber-950">
                    {formatINR(sessionKharcha.total)}
                  </p>
                  <p className="mt-1 text-xs text-amber-900/70">
                    {sessionKharcha.count} purchase
                    {sessionKharcha.count === 1 ? "" : "s"} logged
                  </p>
                </div>
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-white/70 text-amber-800">
                  <Wallet className="size-5" />
                </span>
              </div>
            </div>

            <Surface className="p-4">
              <h3 className="mb-3 text-sm font-semibold text-ink">
                Recent purchase bills
              </h3>
              {recentPurchases.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  Abhi tak koi purchase bill nahi
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {recentPurchases.map((p) => (
                    <li
                      key={p._id}
                      className="flex items-start justify-between gap-2 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">
                          {p.items?.[0]?.name ??
                            p.supplierName ??
                            "Purchase"}
                        </p>
                        <p className="text-xs text-ink-muted">
                          {formatBillDate(p.purchasedAt)}
                          {p.supplierName ? ` · ${p.supplierName}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold text-ink">
                        {formatINR(p.total)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
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
                        <span
                          className="rounded-lg p-1 opacity-40"
                          title="Edit coming soon"
                        >
                          <Pencil className="size-3.5" />
                        </span>
                        <span
                          className="rounded-lg p-1 opacity-40"
                          title="Delete coming soon"
                        >
                          <Trash2 className="size-3.5" />
                        </span>
                      </span>
                    </li>
                  ))
                )}
              </ul>
              <button
                type="button"
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-forest/40 py-2.5 text-sm font-semibold text-forest hover:bg-forest/5"
                onClick={() => setAddCategoryOpen(true)}
              >
                <Plus className="size-4" />
                Add category
              </button>
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
                          {displayStatus(item) === "out"
                            ? "Out of stock"
                            : `${item.availableStock} left`}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-lg bg-forest px-2.5 py-1.5 text-xs font-semibold text-white"
                        onClick={() => openAddStock(item)}
                      >
                        Restock
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
          </aside>
        ) : null}
      </div>

      {addStockOpen ? (
        <AddStockModal
          shopId={shopId}
          items={items}
          categories={categories}
          suppliers={suppliers}
          preselected={addStockFor}
          onClose={() => {
            setAddStockOpen(false);
            setAddStockFor(null);
          }}
          onSaved={({ total, countedAsKharcha, notice }) => {
            if (countedAsKharcha) {
              setSessionKharcha((s) => ({
                total: Math.round((s.total + total) * 100) / 100,
                count: s.count + 1,
              }));
            }
            setStockNotice(notice ?? null);
            void load();
          }}
        />
      ) : null}

      {stockOutFor ? (
        <StockOutModal
          shopId={shopId}
          item={stockOutFor}
          onClose={() => setStockOutFor(null)}
          onSaved={() => void load()}
        />
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
    </div>
  );
}
