import { useEffect, useId, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { formatINR } from "@/lib/cn";
import {
  formatLooseQty,
  looseFamily,
  quickAmountsFor,
  toCanonicalQty,
  type QuickAmount,
} from "./looseUnits";

type Props = {
  open: boolean;
  productName: string;
  unit: string;
  unitPrice: number;
  /** Existing cart qty in product unit (edit mode). */
  initialQty?: number;
  mode: "add" | "edit";
  onClose: () => void;
  onConfirm: (qtyInProductUnit: number) => void;
};

export function WeightPickerSheet({
  open,
  productName,
  unit,
  unitPrice,
  initialQty,
  mode,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const family = looseFamily(unit);
  const smallLabel = family === "weight" ? "g" : "ml";
  const baseLabel = family === "weight" ? "kg" : "L";
  const [inputUnit, setInputUnit] = useState<"base" | "small">("small");
  const [amount, setAmount] = useState("250");

  useEffect(() => {
    if (!open) return;
    if (initialQty && initialQty > 0) {
      const u = unit.trim().toLowerCase();
      const isSmallProduct =
        u === "g" ||
        u === "gm" ||
        u === "gram" ||
        u === "grams" ||
        u === "ml";
      if (isSmallProduct) {
        setInputUnit("small");
        setAmount(String(initialQty));
      } else if (initialQty < 1) {
        setInputUnit("small");
        setAmount(String(Math.round(initialQty * 1000)));
      } else {
        setInputUnit("base");
        setAmount(String(initialQty));
      }
    } else {
      setInputUnit("small");
      setAmount(family === "weight" ? "250" : "250");
    }
  }, [open, initialQty, unit, family]);

  const qty = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return toCanonicalQty(unit, n, inputUnit);
  }, [amount, inputUnit, unit]);

  const lineTotal = Math.round(unitPrice * qty * 100) / 100;
  const quads = quickAmountsFor(unit);

  if (!open) return null;

  function pickQuick(q: QuickAmount) {
    setInputUnit(q.inputUnit);
    setAmount(String(q.amount));
  }

  function submit() {
    if (qty <= 0) return;
    onConfirm(qty);
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(92dvh,640px)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-soft sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pt-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-forest/10 text-forest">
              <Scale className="size-5" />
            </div>
            <div className="min-w-0">
              <p
                id={titleId}
                className="font-display text-lg font-semibold text-ink"
              >
                Kitna chahiye?
              </p>
              <p className="truncate text-sm text-ink-muted">{productName}</p>
              <p className="text-xs text-ink-muted">
                Rate {formatINR(unitPrice)} / {unit}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {quads.map((q) => {
              const selected =
                inputUnit === q.inputUnit && Number(amount) === q.amount;
              return (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => pickQuick(q)}
                  className={`rounded-xl border px-2 py-3 text-sm font-semibold transition-colors ${
                    selected
                      ? "border-forest bg-forest text-white"
                      : "border-line bg-paper-2/60 text-ink hover:bg-paper-2"
                  }`}
                >
                  {q.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-ink-muted">Ya exact likho</p>
            <div className="flex gap-2">
              <Input
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^\d.]/g, ""))
                }
                aria-label="Amount"
                className="h-12"
              />
              <div className="flex shrink-0 overflow-hidden rounded-xl border border-line">
                <button
                  type="button"
                  className={`px-3 text-sm font-semibold ${
                    inputUnit === "small"
                      ? "bg-forest text-white"
                      : "bg-white text-ink-muted"
                  }`}
                  onClick={() => setInputUnit("small")}
                >
                  {smallLabel}
                </button>
                <button
                  type="button"
                  className={`px-3 text-sm font-semibold ${
                    inputUnit === "base"
                      ? "bg-forest text-white"
                      : "bg-white text-ink-muted"
                  }`}
                  onClick={() => setInputUnit("base")}
                >
                  {baseLabel}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-success-soft px-3 py-2.5">
            <span className="text-sm text-success">
              {qty > 0 ? formatLooseQty(qty, unit) : "—"}
            </span>
            <span className="font-display text-lg font-semibold text-forest">
              {formatINR(lineTotal)}
            </span>
          </div>
        </div>

        <div className="shrink-0 border-t border-line/70 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              disabled={qty <= 0}
              onClick={submit}
            >
              {mode === "edit" ? "Update" : "Cart mein daalo"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
