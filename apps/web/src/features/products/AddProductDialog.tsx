import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Bell,
  Check,
  ChevronRight,
  ImagePlus,
  Lightbulb,
  Package,
  ShoppingCart,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { inferProductCategoryGroup } from "@shop-os/shared";
import { Button } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";
import { categoryArtFor } from "./categoryArt";
import type { Product } from "./types";

type Props = {
  shopId: string;
  open: boolean;
  onClose: () => void;
  initialName?: string;
  /** When set, dialog edits this product instead of creating. */
  product?: Product | null;
  onCreated: (product: Product) => void;
  onUpdated?: (product: Product) => void;
  onDeleted?: (productId: string) => void;
};

type CategoryOption = { _id: string; name: string };

const UNITS = ["piece", "pack", "kg", "g", "L", "ml", "dozen", "box"] as const;
const GST_OPTIONS = ["0", "5", "12", "18", "28"] as const;
const FALLBACK_CATEGORIES = [
  "Snacks",
  "Dairy",
  "Groceries",
  "Beverages",
  "Vegetables",
  "Personal Care",
  "Hardware",
  "Others",
];

const MAX_IMAGE_CHARS = 480_000;

function FieldLabel({
  children,
  required,
}: {
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1.5 block text-sm font-medium text-ink">
      {children}
      {required ? <span className="ml-0.5 text-danger">*</span> : null}
    </label>
  );
}

function FieldShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm text-ink focus-within:border-forest",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AddProductDialog({
  shopId,
  open,
  onClose,
  initialName = "",
  product = null,
  onCreated,
  onUpdated,
  onDeleted,
}: Props) {
  const titleId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = Boolean(product?._id);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [name, setName] = useState("");
  const [categoryName, setCategoryName] = useState("Snacks");
  const [unit, setUnit] = useState<string>("pack");
  const [barcode, setBarcode] = useState("");
  const [gst, setGst] = useState("0");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [openingStock, setOpeningStock] = useState("");
  const [minStock, setMinStock] = useState("5");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [previewQty, setPreviewQty] = useState(1);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialStockRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name);
      setCategoryName(inferProductCategoryGroup(product.name, product.unit));
      setUnit(product.unit || "pack");
      setBarcode(product.barcode ?? "");
      setGst("0");
      setPurchasePrice(
        product.purchasePrice != null && product.purchasePrice !== undefined
          ? String(product.purchasePrice)
          : "",
      );
      setSellingPrice(String(product.sellingPrice ?? ""));
      const stock =
        product.availableStock != null && Number.isFinite(product.availableStock)
          ? product.availableStock
          : 0;
      initialStockRef.current = stock;
      setOpeningStock(String(stock));
      setMinStock(
        product.minStock != null && Number.isFinite(product.minStock)
          ? String(product.minStock)
          : "5",
      );
      setDescription("");
      setActive(product.active !== false);
      setImageUrl(product.imageUrl ?? null);
    } else {
      initialStockRef.current = null;
      setName(initialName);
      setCategoryName(
        initialName
          ? inferProductCategoryGroup(initialName, "piece")
          : "Snacks",
      );
      setUnit("pack");
      setBarcode("");
      setGst("0");
      setPurchasePrice("");
      setSellingPrice("");
      setOpeningStock("");
      setMinStock("5");
      setDescription("");
      setActive(true);
      setImageUrl(null);
    }
    setPreviewQty(1);
    setError(null);
    setConfirmDelete(false);

    void (async () => {
      try {
        const res = await api<{ categories: CategoryOption[] }>(
          `/api/shops/${shopId}/categories`,
        );
        setCategories(res.categories);
        if (product?.categoryId) {
          const match = res.categories.find((c) => c._id === product.categoryId);
          if (match) setCategoryName(match.name);
        }
      } catch {
        setCategories([]);
      }
    })();
  }, [open, initialName, shopId, product]);

  const categoryOptions = useMemo(() => {
    const names = new Set([
      ...FALLBACK_CATEGORIES,
      ...categories.map((c) => c.name),
    ]);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [categories]);

  const art = categoryArtFor(name || "Item", unit);
  const sell = Number(sellingPrice);
  const stockQty = Number(openingStock);
  const previewPrice = Number.isFinite(sell) && sell >= 0 ? sell : 0;
  const previewStock =
    Number.isFinite(stockQty) && stockQty >= 0 ? stockQty : 0;

  if (!open) return null;

  function onPickImage(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Sirf JPG/PNG image choose karo");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Image max 2MB honi chahiye");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      if (result.length > MAX_IMAGE_CHARS) {
        setError("Image thodi badi hai — chhoti photo try karo");
        return;
      }
      setImageUrl(result);
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function resolveCategoryId(): Promise<string | undefined> {
    const existing = categories.find(
      (c) => c.name.toLowerCase() === categoryName.trim().toLowerCase(),
    );
    if (existing) return existing._id;
    if (!categoryName.trim()) return undefined;
    try {
      const res = await api<{ category: CategoryOption }>(
        `/api/shops/${shopId}/categories`,
        {
          method: "POST",
          body: JSON.stringify({ name: categoryName.trim() }),
        },
      );
      setCategories((prev) => [...prev, res.category]);
      return res.category._id;
    } catch {
      return undefined;
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Product name required hai");
      return;
    }
    if (!Number.isFinite(sell) || sell < 0) {
      setError("Valid selling price dalo");
      return;
    }
    setLoading(true);
    try {
      const categoryId = await resolveCategoryId();
      const purchase = Number(purchasePrice);
      const opening = Number(openingStock);
      const low = Number(minStock);

      if (editing && product) {
        const patched = await api<{ product: Product }>(
          `/api/shops/${shopId}/products/${product._id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: name.trim(),
              categoryId,
              barcode: barcode.trim() || undefined,
              unit,
              sellingPrice: sell,
              purchasePrice:
                Number.isFinite(purchase) && purchase >= 0
                  ? purchase
                  : undefined,
              trackStock: true,
              minStock: Number.isFinite(low) && low >= 0 ? low : undefined,
              imageUrl: imageUrl || undefined,
              active,
            }),
          },
        );

        let next = patched.product;
        const prevStock = initialStockRef.current ?? 0;
        const nextStock =
          Number.isFinite(opening) && opening >= 0 ? opening : prevStock;
        const delta = nextStock - prevStock;
        if (Math.abs(delta) > 1e-9) {
          await api(`/api/shops/${shopId}/inventory/adjust`, {
            method: "POST",
            body: JSON.stringify({
              productId: product._id,
              type:
                delta > 0
                  ? "MANUAL_ADJUSTMENT_IN"
                  : "MANUAL_ADJUSTMENT_OUT",
              quantityDelta: Math.abs(delta),
              note: "Product edit — available stock",
            }),
          });
          next = {
            ...next,
            availableStock: nextStock,
          };
        }

        onUpdated?.(next);
        onClose();
        return;
      }

      const res = await api<{ product: Product }>(
        `/api/shops/${shopId}/products`,
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            categoryId,
            barcode: barcode.trim() || undefined,
            unit,
            sellingPrice: sell,
            purchasePrice:
              Number.isFinite(purchase) && purchase >= 0
                ? purchase
                : undefined,
            trackStock: true,
            minStock: Number.isFinite(low) && low >= 0 ? low : undefined,
            openingStock:
              Number.isFinite(opening) && opening > 0 ? opening : 0,
            imageUrl: imageUrl || undefined,
            force: true,
          }),
        },
      );

      let created = res.product;
      if (!active) {
        const patched = await api<{ product: Product }>(
          `/api/shops/${shopId}/products/${created._id}`,
          {
            method: "PATCH",
            body: JSON.stringify({ active: false }),
          },
        );
        created = patched.product;
      }

      onCreated(created);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Product save nahi hua",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteConfirm() {
    if (!product?._id) return;
    setDeleting(true);
    setError(null);
    try {
      await api(`/api/shops/${shopId}/products/${product._id}`, {
        method: "DELETE",
      });
      onDeleted?.(product._id);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Product delete nahi hua",
      );
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <form
        className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-soft sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => void onSubmit(e)}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line/70 px-4 py-4 sm:px-6">
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-forest">
            <Package className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id={titleId}
              className="text-lg font-semibold text-ink sm:text-xl"
            >
              {editing ? "Edit Product" : "Add New Product"}
            </h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {editing
                ? "Price, stock aur details update karo — billing mein turant reflect hoga."
                : "Add a new product to your shop inventory. It will be available in billing, inventory and reports."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl p-2 text-ink-muted hover:bg-paper-2 hover:text-ink"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
            <div className="space-y-4">
              <div>
                <FieldLabel>Product Image</FieldLabel>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl border border-line bg-paper-2">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="size-full object-contain p-1"
                      />
                    ) : (
                      <div
                        className="flex size-full items-center justify-center text-2xl"
                        style={{ background: art.bg }}
                      >
                        {art.emoji}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-forest/30 bg-white px-3 text-sm font-semibold text-forest hover:bg-forest/5"
                        onClick={() => fileRef.current?.click()}
                      >
                        <Upload className="size-3.5" />
                        {imageUrl ? "Change Image" : "Upload Image"}
                      </button>
                      {imageUrl ? (
                        <button
                          type="button"
                          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-white px-3 text-sm font-medium text-ink-muted hover:bg-paper-2"
                          onClick={() => setImageUrl(null)}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </button>
                      ) : null}
                    </div>
                    <p className="text-xs text-ink-muted">JPG, PNG (max 2MB)</p>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onPickImage}
                  />
                </div>
              </div>

              <div>
                <FieldLabel required>Product Name</FieldLabel>
                <FieldShell>
                  <Tag className="size-4 shrink-0 text-ink-muted" />
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (e.target.value.trim()) {
                        setCategoryName(
                          inferProductCategoryGroup(e.target.value, unit),
                        );
                      }
                    }}
                    placeholder="e.g. Maggi Noodles"
                    required
                  />
                </FieldShell>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel required>Category</FieldLabel>
                  <FieldShell>
                    <span className="text-base" aria-hidden>
                      {categoryArtFor(categoryName, unit).emoji}
                    </span>
                    <select
                      className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                    >
                      {categoryOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </FieldShell>
                </div>
                <div>
                  <FieldLabel required>Unit</FieldLabel>
                  <FieldShell>
                    <Package className="size-4 shrink-0 text-ink-muted" />
                    <select
                      className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                      value={unit}
                      onChange={(e) => setUnit(e.target.value)}
                    >
                      {UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u === "piece"
                            ? "Piece"
                            : u === "pack"
                              ? "Pack"
                              : u}
                        </option>
                      ))}
                    </select>
                  </FieldShell>
                  {(unit === "pack" ||
                    unit === "bag" ||
                    unit === "kg" ||
                    unit === "g") && (
                    <p className="mt-1.5 text-[11px] text-forest">
                      New Bill pe “Kitna chahiye?” (100g / 250g / 1kg) khulega.
                    </p>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Barcode / SKU</FieldLabel>
                  <FieldShell>
                    <span className="text-xs font-bold text-ink-muted">||||</span>
                    <input
                      className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      placeholder="Barcode or SKU"
                    />
                  </FieldShell>
                </div>
                <div>
                  <FieldLabel>GST (%)</FieldLabel>
                  <FieldShell>
                    <span className="text-sm font-semibold text-ink-muted">%</span>
                    <select
                      className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                      value={gst}
                      onChange={(e) => setGst(e.target.value)}
                    >
                      {GST_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}%
                        </option>
                      ))}
                    </select>
                  </FieldShell>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Purchase Price (₹)</FieldLabel>
                  <FieldShell>
                    <span className="font-semibold text-ink-muted">₹</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="0"
                    />
                  </FieldShell>
                </div>
                <div>
                  <FieldLabel required>Selling Price (₹)</FieldLabel>
                  <FieldShell>
                    <span className="font-semibold text-ink-muted">₹</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      placeholder="0"
                      required
                    />
                  </FieldShell>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel>Available Stock</FieldLabel>
                  <FieldShell>
                    <Package className="size-4 shrink-0 text-ink-muted" />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                      value={openingStock}
                      onChange={(e) => setOpeningStock(e.target.value)}
                      placeholder="0"
                    />
                  </FieldShell>
                </div>
                <div>
                  <FieldLabel>Low Stock Alert</FieldLabel>
                  <FieldShell>
                    <Bell className="size-4 shrink-0 text-ink-muted" />
                    <input
                      type="number"
                      min={0}
                      step="1"
                      className="min-w-0 flex-1 border-0 bg-transparent outline-none"
                      value={minStock}
                      onChange={(e) => setMinStock(e.target.value)}
                      placeholder="5"
                    />
                  </FieldShell>
                </div>
              </div>

              <div>
                <FieldLabel>Description (Optional)</FieldLabel>
                <div className="rounded-xl border border-line bg-white px-3 py-2 focus-within:border-forest">
                  <textarea
                    className="min-h-[88px] w-full resize-y border-0 bg-transparent text-sm outline-none"
                    maxLength={500}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Short product note…"
                  />
                  <p className="text-right text-[11px] text-ink-muted">
                    {description.length}/500
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-2xl border border-line bg-paper-2/40 px-3 py-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={active}
                  onClick={() => setActive((v) => !v)}
                  className={cn(
                    "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors",
                    active ? "bg-forest" : "bg-line",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
                      active ? "left-5" : "left-0.5",
                    )}
                  />
                </button>
                <div>
                  <p className="text-sm font-semibold text-ink">Active</p>
                  <p className="text-xs text-ink-muted">
                    Product will be visible in billing and inventory.
                  </p>
                </div>
              </div>
            </div>

            <aside className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold text-ink">
                  Product Preview
                </p>
                <div className="rounded-2xl border border-line bg-white p-3 shadow-soft">
                  <div className="flex gap-3">
                    <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-line bg-paper-2">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt=""
                          className="size-full object-contain p-1"
                        />
                      ) : (
                        <div
                          className="flex size-full items-center justify-center text-xl"
                          style={{ background: art.bg }}
                        >
                          {art.emoji}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-1">
                        <p className="truncate text-sm font-bold text-ink">
                          {name.trim() || "Product name"}
                        </p>
                        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                          {categoryName}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-ink">
                        {formatINR(previewPrice)}
                        <span className="ml-1 text-xs font-medium text-ink-muted">
                          / {unit}
                        </span>
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-muted">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        Stock: {previewStock}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="inline-flex h-8 items-center gap-1 rounded-full bg-emerald-50 px-1.5 text-sm font-semibold text-forest">
                      <button
                        type="button"
                        className="size-6 rounded-full hover:bg-emerald-100"
                        onClick={() =>
                          setPreviewQty((n) => Math.max(1, n - 1))
                        }
                      >
                        −
                      </button>
                      <span className="min-w-[1.25rem] text-center text-ink">
                        {previewQty}
                      </span>
                      <button
                        type="button"
                        className="size-6 rounded-full bg-emerald-100 hover:bg-emerald-200"
                        onClick={() => setPreviewQty((n) => n + 1)}
                      >
                        +
                      </button>
                    </div>
                    <span className="inline-flex size-8 items-center justify-center rounded-xl bg-forest text-white">
                      <ShoppingCart className="size-4" />
                    </span>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-line">
                {[
                  {
                    icon: ImagePlus,
                    title: "Images Gallery",
                    sub: "Add more images (optional)",
                  },
                  {
                    icon: Tag,
                    title: "Barcode Generator",
                    sub: "Generate barcode if not available",
                  },
                  {
                    icon: Tag,
                    title: "Tags",
                    sub: "Add tags like 'Popular', 'MRP' etc.",
                  },
                ].map((row) => (
                  <button
                    key={row.title}
                    type="button"
                    className="flex w-full items-center gap-3 border-b border-line/70 px-3 py-3 text-left last:border-b-0 hover:bg-paper-2/50"
                    onClick={() =>
                      setError("Yeh option jaldi aaega — pehle product save karo.")
                    }
                  >
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-paper-2 text-ink-muted">
                      <row.icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">
                        {row.title}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {row.sub}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-muted" />
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 p-3">
                <div className="flex gap-2.5">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-forest shadow-soft">
                    <Lightbulb className="size-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-ink">Pro Tip</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                      Local brands ke liye clear naam aur barcode add karo —
                      billing aur reports dono accurate rehte hain.
                    </p>
                  </div>
                </div>
              </div>
            </aside>
          </div>

          {error ? (
            <p className="mt-4 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-line/70 px-4 py-4 sm:px-6">
          <div>
            {editing ? (
              <Button
                type="button"
                variant="secondary"
                className="!border-danger/30 !text-danger hover:!bg-danger-soft"
                leftIcon={<Trash2 className="size-4" />}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              leftIcon={<Check className="size-4" />}
            >
              {editing ? "Save changes" : "Save Product"}
            </Button>
          </div>
        </footer>
      </form>

      {confirmDelete ? (
        <div
          className="absolute inset-0 z-[60] flex items-center justify-center bg-ink/50 p-4"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-labelledby="delete-product-title"
          >
            <h3
              id="delete-product-title"
              className="text-lg font-semibold text-ink"
            >
              Product delete karein?
            </h3>
            <p className="text-sm text-ink-muted">
              <span className="font-semibold text-ink">{product?.name}</span>{" "}
              billing list se hata diya jayega. Purane bills safe rahenge.
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                fullWidth
                loading={deleting}
                className="!bg-danger hover:!bg-danger/90"
                onClick={() => void onDeleteConfirm()}
              >
                Haan, delete
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
