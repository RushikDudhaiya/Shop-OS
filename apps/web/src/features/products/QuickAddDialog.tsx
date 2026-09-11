import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { Mic, MicOff } from "lucide-react";
import { getShopCatalog, type CatalogItem } from "@shop-os/shared";
import { Button, Input } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api";
import { parseSpokenPrice, parseSpokenProduct } from "@/lib/parseSpeech";
import { useSpeechInput } from "@/lib/speech";
import { cn } from "@/lib/cn";
import type { Product } from "./types";

type Props = {
  shopId: string;
  businessType?: string | null;
  open: boolean;
  onClose: () => void;
  initialName?: string;
  onCreated: (product: Product) => void;
  title?: string;
  submitLabel?: string;
};

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "·"] as const;

export function QuickAddDialog({
  shopId,
  businessType,
  open,
  onClose,
  initialName = "",
  onCreated,
  title = "Naya product",
  submitLabel = "Add product",
}: Props) {
  const titleId = useId();
  const catalog = useMemo(() => getShopCatalog(businessType), [businessType]);
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState("piece");
  const [sellingPrice, setSellingPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const speech = useSpeechInput(["hi-IN", "en-IN"]);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setUnit("piece");
      setSellingPrice("");
      setError(null);
      setHint(
        speech.supported
          ? `Likhna mat — mic dabao aur bolo: ${catalog.voiceExamples}`
          : "Neeche se naam tap karo, phir price number pad se",
      );
      speech.setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open
  }, [open, initialName, catalog.voiceExamples]);

  if (!open) return null;

  function pickCatalog(item: CatalogItem) {
    setName(item.name);
    setUnit(item.unit);
    setHint(`${item.name} select — ab price bolo ya number dabao`);
    setError(null);
  }

  function onPad(key: (typeof PAD)[number]) {
    setSellingPrice((prev) => {
      if (key === "⌫") return prev.slice(0, -1);
      if (key === "·") {
        if (prev.includes(".")) return prev;
        return prev ? `${prev}.` : "0.";
      }
      if (prev === "0" && key !== "·") return key;
      return `${prev}${key}`;
    });
  }

  async function listenProduct() {
    setError(null);
    try {
      const text = await speech.listen();
      const parsed = parseSpokenProduct(text);
      if (parsed.name) setName(parsed.name);
      if (parsed.price != null) setSellingPrice(String(parsed.price));
      setHint(
        parsed.price != null
          ? `Suna: ${parsed.name} · ₹${parsed.price}`
          : `Naam mila: ${parsed.name || text} — ab price bolo`,
      );
      const match = catalog.tapItems.find(
        (c) =>
          parsed.name &&
          c.name.toLowerCase() === parsed.name.toLowerCase(),
      );
      if (match) setUnit(match.unit);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice fail");
    }
  }

  async function listenPriceOnly() {
    setError(null);
    try {
      const text = await speech.listen();
      const price = parseSpokenPrice(text);
      if (price == null) {
        setError(`Price samajh nahi aayi: “${text}”`);
        return;
      }
      setSellingPrice(String(price));
      setHint(`Price: ₹${price}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice fail");
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const price = Number(sellingPrice);
    if (!name.trim()) {
      setError("Pehle naam bolo ya list se tap karo");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setError("Price number pad se dabao ya bolo");
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ product: Product }>(
        `/api/shops/${shopId}/products`,
        {
          method: "POST",
          body: JSON.stringify({
            name: name.trim(),
            sellingPrice: price,
            unit,
            trackStock: unit === "kg" || unit === "L" || unit === "g",
            openingStock: 0,
            force: true,
          }),
        },
      );
      onCreated(res.product);
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.body.message
          : "Product add nahi hua",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4 shadow-soft sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="font-display text-xl font-semibold text-ink">
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Likhna zaroori nahi — bolo ya tap karo.
        </p>

        {speech.supported ? (
          <button
            type="button"
            onClick={() => void listenProduct()}
            className={cn(
              "mt-4 flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-5 transition-colors",
              speech.listening
                ? "border-danger bg-danger-soft text-danger"
                : "border-forest/40 bg-forest/5 text-forest hover:bg-forest/10",
            )}
          >
            {speech.listening ? (
              <MicOff className="size-10 animate-pulse" />
            ) : (
              <Mic className="size-10" />
            )}
            <span className="text-base font-semibold">
              {speech.listening ? "Sun raha hai… bolo!" : "Bol ke add karo"}
            </span>
            <span className="text-center text-xs opacity-80">
              Example: {catalog.voiceExamples}
            </span>
          </button>
        ) : (
          <p className="mt-3 rounded-xl bg-paper-2 px-3 py-2 text-sm text-ink-muted">
            Voice ke liye Chrome / phone browser use karo. Abhi tap se chalega.
          </p>
        )}

        <form className="mt-4 space-y-3" onSubmit={onSubmit}>
          <div className="rounded-xl border border-line bg-paper-2/50 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Naam
            </p>
            <p className="mt-0.5 font-display text-lg font-semibold text-ink">
              {name.trim() || "— abhi select nahi —"}
            </p>
            {name.trim() ? (
              <p className="text-xs text-ink-muted">Unit: {unit}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-ink-muted">
              Ya list se tap karo
            </p>
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {catalog.tapItems.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => pickCatalog(item)}
                  className={cn(
                    "rounded-full border px-2.5 py-1.5 text-sm font-medium transition-colors",
                    name === item.name
                      ? "border-forest bg-forest text-white"
                      : "border-line bg-white text-ink hover:bg-paper-2",
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          {/* Optional typed name for those who can */}
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-muted">
              Type karke naam likhna hai?
            </summary>
            <div className="mt-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Product naam"
                aria-label="Product name"
              />
            </div>
          </details>

          <div className="rounded-xl border border-line px-3 py-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Bechne ka daam
                </p>
                <p className="font-display text-3xl font-semibold text-forest">
                  ₹{sellingPrice || "0"}
                </p>
              </div>
              {speech.supported ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon={<Mic className="size-4" />}
                  onClick={() => void listenPriceOnly()}
                  disabled={speech.listening}
                >
                  Price bolo
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {PAD.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onPad(key)}
                  className="h-12 rounded-xl border border-line bg-white text-lg font-semibold text-ink active:bg-paper-2"
                >
                  {key}
                </button>
              ))}
            </div>
          </div>

          {hint ? (
            <p className="text-sm text-forest" role="status">
              {hint}
            </p>
          ) : null}
          {error || speech.error ? (
            <p className="text-sm text-danger">{error || speech.error}</p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="secondary" fullWidth onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="gold" fullWidth loading={loading}>
              {submitLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
