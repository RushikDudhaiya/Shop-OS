import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Download,
  Phone,
  Printer,
  Share2,
} from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button, PageLoader, Surface } from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";

type Invoice = {
  invoiceNumber: string;
  saleId: string;
  shop: {
    name: string;
    address: string | null;
    phone: string | null;
    gstEnabled: boolean;
    gstin: string | null;
    taxLabel?: string | null;
    gstRate?: number | null;
    billTerms?: string | null;
  };
  customer: { name: string; phone: string | null };
  completedAt: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  payments: Array<{
    method: string;
    amount: number;
    receivedAt: string | null;
  }>;
  textSummary: string;
};

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function formatPhone(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

function paymentMethodLabel(method: string) {
  const map: Record<string, string> = {
    CASH: "Cash",
    UPI: "UPI",
    CARD: "Card",
    CREDIT: "Credit",
    BANK_TRANSFER: "Bank",
  };
  return map[method] ?? method;
}

function roundMoney(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function InvoicePage() {
  const { saleId } = useParams<{ saleId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const shouldAutoPrint = searchParams.get("print") === "1";

  useEffect(() => {
    if (!shopId || !saleId) return;
    void (async () => {
      setLoading(true);
      try {
        const data = await api<{ invoice: Invoice }>(
          `/api/shops/${shopId}/sales/${saleId}/invoice`,
        );
        setInvoice(data.invoice);
      } finally {
        setLoading(false);
      }
    })();
  }, [shopId, saleId]);

  useEffect(() => {
    if (!invoice || !shouldAutoPrint) return;
    const t = window.setTimeout(() => {
      window.print();
      const next = new URLSearchParams(searchParams);
      next.delete("print");
      setSearchParams(next, { replace: true });
    }, 400);
    return () => window.clearTimeout(t);
  }, [invoice, shouldAutoPrint, searchParams, setSearchParams]);

  const totals = useMemo(() => {
    if (!invoice) return null;
    const preTaxTotal = roundMoney(invoice.subtotal - invoice.discount);
    const halfRate = invoice.shop.gstRate ? invoice.shop.gstRate / 2 : null;
    const cgst = invoice.shop.gstEnabled && invoice.tax > 0 ? roundMoney(invoice.tax / 2) : 0;
    const sgst = invoice.shop.gstEnabled && invoice.tax > 0 ? roundMoney(invoice.tax / 2) : 0;
    const totalBeforeRound = roundMoney(preTaxTotal + invoice.tax);
    const grandTotal = Math.round(invoice.total);
    const roundedOff = roundMoney(grandTotal - invoice.total);
    return {
      preTaxTotal,
      halfRate,
      cgst,
      sgst,
      totalBeforeRound,
      grandTotal,
      roundedOff,
    };
  }, [invoice]);

  async function shareWhatsApp() {
    if (!shopId || !saleId) return;
    setSharing(true);
    setShareMessage(null);
    try {
      const res = await api<{ whatsappUrl?: string | null; message?: string }>(
        `/api/shops/${shopId}/sales/${saleId}/share`,
        {
          method: "POST",
          body: JSON.stringify({
            channel: "WHATSAPP",
            phone: invoice?.customer.phone || undefined,
          }),
        },
      );
      if (res.whatsappUrl) {
        window.open(res.whatsappUrl, "_blank", "noopener,noreferrer");
      } else {
        setShareMessage(res.message ?? "WhatsApp share fail");
      }
    } catch (err) {
      setShareMessage(
        err instanceof ApiRequestError ? err.body.message : "Share fail",
      );
    } finally {
      setSharing(false);
    }
  }

  function downloadPdf() {
    window.print();
  }

  if (loading || !invoice || !totals) return <PageLoader />;

  const isPaid = invoice.amountDue <= 0;
  const primaryPayment = invoice.payments[0];
  const paymentDate =
    primaryPayment?.receivedAt ?? invoice.completedAt ?? null;
  const paidBy = primaryPayment
    ? paymentMethodLabel(primaryPayment.method)
    : isPaid
      ? "Cash"
      : "Credit";

  return (
    <div className="w-full space-y-4 print:space-y-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            leftIcon={<ArrowLeft className="size-4" />}
            onClick={() => navigate(-1)}
          >
            Back
          </Button>
          <Button
            variant="primary"
            leftIcon={<Printer className="size-4" />}
            onClick={() => window.print()}
          >
            Print again
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            leftIcon={<Printer className="size-4" />}
            onClick={() => window.print()}
          >
            Print
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Download className="size-4" />}
            onClick={downloadPdf}
          >
            Download PDF
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Share2 className="size-4" />}
            onClick={() => void shareWhatsApp()}
            loading={sharing}
          >
            Share
          </Button>
        </div>
      </div>

      {shareMessage ? (
        <p className="text-sm text-danger print:hidden">{shareMessage}</p>
      ) : null}

      <Surface className="mx-auto max-w-4xl space-y-6 !p-6 md:!p-8 print:max-w-none print:border-0 print:shadow-none">
        <div className="flex flex-col gap-6 border-b border-line/70 pb-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-success-soft text-lg font-semibold text-forest">
              {initialsFor(invoice.shop.name)}
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                {invoice.shop.name}
              </h1>
              {invoice.shop.gstEnabled && invoice.shop.gstin ? (
                <p className="mt-1 text-sm text-ink-muted">
                  GSTIN: {invoice.shop.gstin}
                </p>
              ) : null}
              {invoice.shop.address ? (
                <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
                  {invoice.shop.address}
                </p>
              ) : null}
              {formatPhone(invoice.shop.phone) ? (
                <p className="mt-2 inline-flex items-center gap-2 text-sm text-ink-muted">
                  <Phone className="size-4 shrink-0" />
                  {formatPhone(invoice.shop.phone)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="shrink-0 lg:text-right">
            <span
              className={cn(
                "inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-wide",
                isPaid
                  ? "bg-success-soft text-success"
                  : "bg-orange-100 text-orange-700",
              )}
            >
              {isPaid ? "PAID" : "DUE"}
            </span>
            <p className="mt-3 font-display text-xl font-semibold text-ink">
              Invoice {invoice.invoiceNumber}
            </p>
            <p className="mt-1 text-sm text-ink-muted">{invoice.customer.name}</p>
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-ink-muted lg:justify-end">
              <CalendarDays className="size-4 shrink-0" />
              {formatDateTime(invoice.completedAt)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-line/70 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                <th className="px-2 py-3 w-10">#</th>
                <th className="px-3 py-3">Item</th>
                <th className="px-3 py-3 text-right">Rate (₹)</th>
                <th className="px-3 py-3 text-right">Qty</th>
                <th className="px-3 py-3 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {invoice.items.map((item, index) => (
                <tr key={`${item.name}-${index}`}>
                  <td className="px-2 py-3.5 text-ink-muted">{index + 1}</td>
                  <td className="px-3 py-3.5">
                    <p className="font-semibold text-ink">{item.name}</p>
                    <p className="text-xs text-ink-muted">
                      @{formatINR(item.unitPrice)}
                    </p>
                  </td>
                  <td className="px-3 py-3.5 text-right text-ink">
                    {formatINR(item.unitPrice)}
                  </td>
                  <td className="px-3 py-3.5 text-right text-ink">
                    {item.quantity}
                  </td>
                  <td className="px-3 py-3.5 text-right font-semibold text-ink">
                    {formatINR(item.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="rounded-2xl border border-line/80 bg-paper/40 p-4">
              <h2 className="mb-3 text-sm font-semibold text-ink">
                Payment Details
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-ink-muted">Paid By</dt>
                <dd className="font-medium text-ink">{paidBy}</dd>
                <dt className="text-ink-muted">Amount</dt>
                <dd className="font-medium text-ink">
                  {formatINR(invoice.amountPaid)}
                </dd>
                <dt className="text-ink-muted">Date</dt>
                <dd className="font-medium text-ink">
                  {formatDateTime(paymentDate)}
                </dd>
              </dl>
            </div>

            <div className="rounded-2xl border border-line/80 bg-paper/40 p-4">
              <h2 className="text-sm font-semibold text-ink">Thank You!</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
                {invoice.shop.billTerms?.trim() ||
                  "Thank you for shopping with us. Visit again!"}
              </p>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <TotalRow label="Subtotal" value={formatINR(invoice.subtotal)} />
            {invoice.discount > 0 ? (
              <TotalRow
                label="Discount"
                value={`-${formatINR(invoice.discount)}`}
              />
            ) : null}
            {invoice.shop.gstEnabled && invoice.tax > 0 ? (
              <>
                <TotalRow
                  label={`CGST${totals.halfRate ? ` (${totals.halfRate}%)` : ""}`}
                  value={formatINR(totals.cgst)}
                />
                <TotalRow
                  label={`SGST${totals.halfRate ? ` (${totals.halfRate}%)` : ""}`}
                  value={formatINR(totals.sgst)}
                />
              </>
            ) : invoice.tax > 0 ? (
              <TotalRow
                label={
                  invoice.shop.taxLabel
                    ? `${invoice.shop.taxLabel}${invoice.shop.gstRate ? ` (${invoice.shop.gstRate}%)` : ""}`
                    : "Tax"
                }
                value={formatINR(invoice.tax)}
              />
            ) : null}
            <TotalRow
              label="Total"
              value={formatINR(totals.totalBeforeRound)}
              bold
            />
            {totals.roundedOff !== 0 ? (
              <TotalRow
                label="Rounded Off"
                value={`${totals.roundedOff > 0 ? "+" : ""}${formatINR(totals.roundedOff)}`}
              />
            ) : null}
            <div className="flex items-center justify-between rounded-xl bg-success-soft px-4 py-3">
              <span className="font-semibold text-forest">Grand Total</span>
              <span className="font-display text-xl font-semibold text-forest">
                {formatINR(totals.grandTotal)}
              </span>
            </div>
            <TotalRow label="Amount Paid" value={formatINR(invoice.amountPaid)} />
            <TotalRow
              label="Balance Due"
              value={formatINR(invoice.amountDue)}
              bold
              valueClassName={
                invoice.amountDue > 0 ? "text-orange-700" : "text-success"
              }
            />
          </div>
        </div>

        <p className="border-t border-line/70 pt-4 text-center text-xs text-ink-muted">
          This is a computer generated invoice and does not require signature.
        </p>
      </Surface>
    </div>
  );
}

function TotalRow({
  label,
  value,
  bold,
  valueClassName,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={cn("text-ink-muted", bold && "font-semibold text-ink")}>
        {label}
      </span>
      <span
        className={cn(
          bold ? "font-semibold text-ink" : "text-ink",
          valueClassName,
        )}
      >
        {value}
      </span>
    </div>
  );
}
