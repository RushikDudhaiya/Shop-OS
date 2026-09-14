import { useMemo, useState, type FormEvent } from "react";
import { Button, Input } from "@/components/ui";
import { formatINR } from "@/lib/cn";

export type PayMethod = "CASH" | "UPI" | "CREDIT";

type Props = {
  open: boolean;
  method: PayMethod;
  total: number;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (payload: {
    method: PayMethod;
    amount?: number;
    receivedAmount?: number;
    customerName?: string;
    customerPhone?: string;
  }) => void;
};

export function PaymentSheet({
  open,
  method,
  total,
  loading,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [received, setReceived] = useState(String(total));
  const [partial, setPartial] = useState(String(total));
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const change = useMemo(() => {
    const r = Number(received);
    if (!Number.isFinite(r)) return 0;
    return Math.max(0, Math.round((r - total) * 100) / 100);
  }, [received, total]);

  if (!open) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (method === "CASH") {
      onConfirm({
        method: "CASH",
        amount: total,
        receivedAmount: Number(received),
      });
      return;
    }
    if (method === "UPI") {
      onConfirm({
        method: "UPI",
        amount: Number(partial) || total,
      });
      return;
    }
    onConfirm({
      method: "CREDIT",
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim() || undefined,
    });
  }

  const title =
    method === "CASH" ? "Cash" : method === "UPI" ? "UPI" : "Udhaar";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-soft"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <div>
          <h2 className="text-xl font-semibold">{title} payment</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Bill total {formatINR(total)}
          </p>
        </div>

        {method === "CASH" ? (
          <>
            <Input
              label="Customer ne diye (₹)"
              inputMode="decimal"
              value={received}
              onChange={(e) => setReceived(e.target.value)}
              autoFocus
              required
            />
            <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
              Change: <strong>{formatINR(change)}</strong>
            </p>
          </>
        ) : null}

        {method === "UPI" ? (
          <>
            <Input
              label="Received amount (₹)"
              inputMode="decimal"
              value={partial}
              onChange={(e) => setPartial(e.target.value)}
              hint="Partial UPI bhi chalega"
              autoFocus
              required
            />
            <p className="text-sm text-ink-muted">
              Payment received confirm karke sale save hogi.
            </p>
          </>
        ) : null}

        {method === "CREDIT" ? (
          <>
            <Input
              label="Customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Ramesh"
              required
              autoFocus
            />
            <Input
              label="Phone (optional)"
              inputMode="numeric"
              value={customerPhone}
              onChange={(e) =>
                setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="9876543210"
            />
          </>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex gap-2">
          <Button type="button" variant="secondary" fullWidth onClick={onClose}>
            Back
          </Button>
          <Button type="submit" variant="gold" fullWidth loading={loading}>
            {method === "UPI" ? "Payment Received" : "Complete Sale"}
          </Button>
        </div>
      </form>
    </div>
  );
}
