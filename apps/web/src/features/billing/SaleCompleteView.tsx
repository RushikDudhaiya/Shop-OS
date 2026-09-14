import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Banknote,
  Check,
  Clock3,
  Download,
  FileText,
  MessageCircle,
  Plus,
  Printer,
  Share2,
} from "lucide-react";
import { Input } from "@/components/ui";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";
import { formatLooseQty, resolveLooseSale } from "./looseUnits";
import "./sale-complete.css";

export type SaleCompleteItem = {
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type Props = {
  shopId: string;
  saleId: string;
  invoiceNumber: string;
  subtotal: number;
  tax?: number;
  taxLabel?: string;
  gstRate?: number;
  discount?: number;
  roundOff?: number;
  total: number;
  methodLabel: string;
  change?: number;
  amountDue?: number;
  customerPhone?: string | null;
  completedAt: string;
  items: SaleCompleteItem[];
  onNewBill: () => void;
};

const CONFETTI = [
  { top: "6%", left: "10%", color: "#a855f7", rotate: "12deg", shape: "circle" as const },
  { top: "12%", left: "72%", color: "#3b82f6", rotate: "-18deg", shape: "square" as const },
  { top: "18%", left: "38%", color: "#ef4444", rotate: "30deg", shape: "square" as const },
  { top: "8%", left: "88%", color: "#f59e0b", rotate: "-8deg", shape: "circle" as const },
  { top: "62%", left: "6%", color: "#8b5cf6", rotate: "-8deg", shape: "square" as const },
  { top: "70%", left: "82%", color: "#22c55e", rotate: "20deg", shape: "circle" as const },
  { top: "44%", left: "90%", color: "#f97316", rotate: "-25deg", shape: "square" as const },
  { top: "52%", left: "14%", color: "#06b6d4", rotate: "14deg", shape: "circle" as const },
  { top: "28%", left: "92%", color: "#ec4899", rotate: "45deg", shape: "square" as const },
  { top: "78%", left: "42%", color: "#eab308", rotate: "-12deg", shape: "circle" as const },
];

function unitLabel(unit?: string | null) {
  const u = (unit || "piece").trim().toLowerCase();
  if (u === "kg" || u === "g" || u === "gm") return u === "gm" ? "g" : u;
  if (u === "l" || u === "lt" || u === "ltr" || u === "ml") return u;
  if (u === "piece" || u === "pcs" || u === "pc") return "piece";
  if (u === "packet" || u === "pkt" || u === "pack" || u === "bag") return "pack";
  return u;
}

function formatItemLabel(item: SaleCompleteItem) {
  const plan = resolveLooseSale({
    name: item.name,
    unit: item.unit || "piece",
    sellingPrice: item.unitPrice,
  });
  const variant = unitLabel(plan.billingUnit ?? item.unit);
  const qty = plan.loose
    ? formatLooseQty(plan.toBillingQty(item.quantity), plan.billingUnit)
    : String(item.quantity);
  return `${item.name} (${variant})${plan.loose ? ` · ${qty}` : qty !== "1" ? ` · ${qty}` : ""}`;
}

function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

export function SaleCompleteView({
  shopId,
  saleId,
  invoiceNumber,
  subtotal,
  tax = 0,
  gstRate = 0,
  discount = 0,
  roundOff = 0,
  total,
  methodLabel,
  change = 0,
  amountDue = 0,
  customerPhone,
  completedAt,
  items,
  onNewBill,
}: Props) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [phone, setPhone] = useState(customerPhone ?? "");
  const [askPhone, setAskPhone] = useState(false);

  const isOffline = saleId.startsWith("offline-");
  const isPaid = amountDue <= 0;
  const halfRate = gstRate > 0 ? gstRate / 2 : 0;
  const cgst = gstRate > 0 ? Math.round((tax / 2) * 100) / 100 : 0;
  const sgst = cgst;

  const shareText = useMemo(() => {
    const lines = items.map(
      (item, index) =>
        `${index + 1}. ${formatItemLabel(item)} - ${formatINR(item.lineTotal)}`,
    );
    return [
      `Invoice ${invoiceNumber}`,
      `Total: ${formatINR(total)}`,
      `Payment: ${methodLabel}`,
      "",
      ...lines,
    ].join("\n");
  }, [invoiceNumber, items, methodLabel, total]);

  async function share(channel: "WHATSAPP" | "PRINT") {
    if (isOffline) {
      setMessage("Offline sale — sync ke baad share kar sakte ho.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await api<{
        ok: boolean;
        message?: string;
        whatsappUrl?: string | null;
      }>(`/api/shops/${shopId}/sales/${saleId}/share`, {
        method: "POST",
        body: JSON.stringify({
          channel,
          phone: phone || undefined,
        }),
      });

      if (channel === "PRINT") {
        navigate(`/invoice/${saleId}?print=1`);
        return;
      }

      if (res.whatsappUrl) {
        window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
        setMessage("WhatsApp open ho gaya. Sale already saved.");
      } else {
        setMessage(
          res.message ??
            "WhatsApp fail — sale safe hai. Phone check karke retry.",
        );
        setAskPhone(true);
      }
    } catch (err) {
      setMessage(
        err instanceof ApiRequestError
          ? `${err.body.message} (sale safe hai)`
          : "Share fail — sale safe hai",
      );
      setAskPhone(true);
    } finally {
      setBusy(false);
    }
  }

  async function shareBill() {
    if (isOffline) {
      setMessage("Offline sale — sync ke baad share kar sakte ho.");
      return;
    }
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Invoice ${invoiceNumber}`,
          text: shareText,
        });
        return;
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setMessage("Bill details copy ho gayi.");
    } catch {
      setMessage("Share nahi ho paya — Print ya WhatsApp try karo.");
    }
  }

  function downloadPdf() {
    if (isOffline) {
      setMessage("Offline sale — sync ke baad PDF download kar sakte ho.");
      return;
    }
    navigate(`/invoice/${saleId}?print=1`);
  }

  return (
    <div className="sale-complete-page">
      <div className="sale-complete-confetti" aria-hidden>
        {CONFETTI.map((piece, index) => (
          <span
            key={index}
            className={piece.shape === "circle" ? "is-circle" : undefined}
            style={{
              top: piece.top,
              left: piece.left,
              background: piece.color,
              transform: `rotate(${piece.rotate})`,
            }}
          />
        ))}
      </div>

      <div className="sale-complete-wrap">
        <div className="sale-complete-card">
          <div className="sale-complete-hero">
            <div className="sale-complete-check-wrap">
              <div className="sale-complete-check">
                <Check className="size-8 text-white" strokeWidth={2.5} />
              </div>
            </div>

            <div className="sale-complete-heading">
              <h1>Sale Completed!</h1>
              <p>Your bill has been created successfully.</p>
            </div>

            <div className="sale-complete-amount-wrap">
              <div className="sale-complete-amount-box">
                <p className="sale-complete-amount">{formatINR(total)}</p>
              </div>
              <span
                className={cn(
                  "sale-complete-paid-badge",
                  !isPaid && "is-due",
                )}
              >
                {isPaid ? "PAID" : "UDHAAR"}
              </span>
            </div>
          </div>

          <div className="sale-complete-meta">
            <div className="sale-complete-meta-item">
              <div className="sale-complete-meta-icon">
                <FileText className="size-3.5" />
              </div>
              <p className="sale-complete-meta-label">Invoice No.</p>
              <p className="sale-complete-meta-value">{invoiceNumber}</p>
            </div>
            <div className="sale-complete-meta-item">
              <div className="sale-complete-meta-icon">
                <Clock3 className="size-3.5" />
              </div>
              <p className="sale-complete-meta-label">Date &amp; Time</p>
              <p className="sale-complete-meta-value">
                {formatDateTime(completedAt)}
              </p>
            </div>
            <div className="sale-complete-meta-item">
              <div className="sale-complete-meta-icon">
                <Banknote className="size-3.5" />
              </div>
              <p className="sale-complete-meta-label">Payment Method</p>
              <p className="sale-complete-meta-value">{methodLabel}</p>
            </div>
          </div>

          <div className="sale-complete-summary">
            <div className="sale-complete-summary-head">
              <span>Bill Summary</span>
              <span className="sale-complete-summary-count">
                {items.length} Item{items.length === 1 ? "" : "s"}
              </span>
            </div>

            {items.map((item, index) => (
              <div key={`${item.name}-${index}`} className="sale-complete-item">
                <span>
                  {index + 1}. {formatItemLabel(item)}
                </span>
                <span className="sale-complete-item-price">
                  {formatINR(item.lineTotal)}
                </span>
              </div>
            ))}

            <div className="sale-complete-totals">
              <div className="sale-complete-total-row">
                <span>Subtotal</span>
                <span>{formatINR(subtotal)}</span>
              </div>
              <div className="sale-complete-total-row">
                <span>Discount</span>
                <span>{formatINR(discount)}</span>
              </div>
              {gstRate > 0 ? (
                <>
                  <div className="sale-complete-total-row">
                    <span>CGST ({halfRate}%)</span>
                    <span>{formatINR(cgst)}</span>
                  </div>
                  <div className="sale-complete-total-row">
                    <span>SGST ({halfRate}%)</span>
                    <span>{formatINR(sgst)}</span>
                  </div>
                </>
              ) : null}
              {Math.abs(roundOff) >= 0.01 ? (
                <div className="sale-complete-total-row">
                  <span>Round Off</span>
                  <span>
                    {roundOff > 0 ? "+" : ""}
                    {formatINR(roundOff)}
                  </span>
                </div>
              ) : null}
              <div className="sale-complete-grand-total">
                <span>Grand Total</span>
                <span>{formatINR(total)}</span>
              </div>
            </div>
          </div>

          {change > 0 ? (
            <p className="sale-complete-note is-success">
              Change to return: <strong>{formatINR(change)}</strong>
            </p>
          ) : null}

          {amountDue > 0 ? (
            <p className="sale-complete-note is-due">
              Udhaar baaki: {formatINR(amountDue)}
            </p>
          ) : null}

          {askPhone ? (
            <div className="sale-complete-phone">
              <Input
                label="WhatsApp number"
                inputMode="numeric"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                }
                placeholder="9876543210"
              />
            </div>
          ) : null}

          {message ? (
            <p className="sale-complete-message">{message}</p>
          ) : null}

          <div className="sale-complete-actions">
            <button
              type="button"
              className="sale-complete-action-btn"
              disabled={busy}
              onClick={() => {
                if (!phone && !askPhone) {
                  setAskPhone(true);
                  return;
                }
                void share("WHATSAPP");
              }}
            >
              <MessageCircle className="size-4" />
              WhatsApp Bill
            </button>
            <button
              type="button"
              className="sale-complete-action-btn"
              disabled={busy || isOffline}
              onClick={() => void share("PRINT")}
            >
              <Printer className="size-4" />
              Print Bill
            </button>
            <button
              type="button"
              className="sale-complete-action-btn"
              disabled={busy || isOffline}
              onClick={() => void shareBill()}
            >
              <Share2 className="size-4" />
              Share Bill
            </button>
            <button
              type="button"
              className="sale-complete-action-btn"
              disabled={busy || isOffline}
              onClick={downloadPdf}
            >
              <Download className="size-4" />
              Download PDF
            </button>
          </div>

          <div className="sale-complete-or">OR</div>

          <button type="button" className="sale-complete-new-btn" onClick={onNewBill}>
            <span className="sale-complete-new-btn-icon">
              <Plus className="size-4" strokeWidth={2.5} />
            </span>
            New Bill
          </button>
        </div>

        <button type="button" className="sale-complete-back" onClick={onNewBill}>
          <ArrowLeft className="size-4" />
          Back to New Bill
        </button>
      </div>
    </div>
  );
}
