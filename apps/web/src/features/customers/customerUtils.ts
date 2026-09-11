import type { CustomerDetail, LedgerEntry } from "@/features/customers/types";
import { formatINR } from "@/lib/cn";

export const OVERDUE_DAYS = 30;

export function formatPhone(phone: string | null) {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

export function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "?").toUpperCase();
}

export function isWalkIn(name: string, phone: string | null) {
  return !phone || /walk[\s-]?in/i.test(name);
}

export function paymentMethodLabel(method: string | null) {
  if (!method) return "—";
  const map: Record<string, string> = {
    CASH: "Cash",
    UPI: "UPI",
    CARD: "Card",
    CREDIT: "Credit",
    BANK_TRANSFER: "Bank",
  };
  return map[method] ?? method;
}

export function buildLedger(detail: CustomerDetail): LedgerEntry[] {
  const salesById = new Map(detail.sales.map((sale) => [sale._id, sale]));

  function isInstantSalePayment(payment: CustomerDetail["payments"][number]) {
    if (!payment.saleId) return false;
    const sale = salesById.get(payment.saleId);
    if (!sale || sale.amountDue > 0) return false;
    if (!sale.completedAt || !payment.receivedAt) return true;
    const saleTime = new Date(sale.completedAt).getTime();
    const payTime = new Date(payment.receivedAt).getTime();
    return Math.abs(payTime - saleTime) < 120_000;
  }

  function paymentLabelForSale(sale: CustomerDetail["sales"][number]) {
    const linked = detail.payments.filter((p) => p.saleId === sale._id);
    if (linked.length > 0) {
      return paymentMethodLabel(linked[0]!.method);
    }
    if (sale.amountDue > 0) return "Credit";
    return "Cash";
  }

  const events: Array<{
    id: string;
    type: "invoice" | "payment";
    number: string;
    date: string | null;
    amount: number;
    paymentLabel: string;
    sortKey: number;
    affectsBalance: boolean;
  }> = [];

  for (const sale of detail.sales) {
    const hasInstantPayment = detail.payments.some(
      (p) => p.saleId === sale._id && isInstantSalePayment(p),
    );
    events.push({
      id: sale._id,
      type: "invoice",
      number: sale.invoiceNumber,
      date: sale.completedAt,
      amount: sale.total,
      paymentLabel: paymentLabelForSale(sale),
      sortKey: sale.completedAt ? new Date(sale.completedAt).getTime() : 0,
      affectsBalance: sale.amountDue > 0 || !hasInstantPayment,
    });
  }

  for (const payment of detail.payments) {
    if (isInstantSalePayment(payment)) continue;
    events.push({
      id: payment._id,
      type: "payment",
      number: payment.reference,
      date: payment.receivedAt ?? null,
      amount: payment.amount,
      paymentLabel: paymentMethodLabel(payment.method),
      sortKey: payment.receivedAt ? new Date(payment.receivedAt).getTime() : 0,
      affectsBalance: true,
    });
  }

  events.sort((a, b) => a.sortKey - b.sortKey);

  let balance = 0;
  return events.map((event) => {
    if (event.type === "invoice") {
      if (event.affectsBalance) balance += event.amount;
    } else if (event.affectsBalance) {
      balance -= event.amount;
    }
    return {
      id: event.id,
      type: event.type,
      number: event.number,
      date: event.date,
      amount: event.amount,
      paymentLabel: event.paymentLabel,
      balance: Math.max(0, balance),
    };
  });
}

export function downloadStatement(detail: CustomerDetail) {
  const c = detail.customer;
  const ledger = buildLedger(detail);
  const lines = [
    `Customer Statement — ${c.name}`,
    `Generated: ${formatDate(new Date().toISOString())}`,
    "",
    `Total Sales: ${formatINR(c.purchaseTotal)}`,
    `Outstanding: ${formatINR(c.outstandingDue)}`,
    `Received: ${formatINR(c.totalReceived)}`,
    "",
    "Date,Type,Number,Amount,Payment,Balance",
    ...ledger.map((row) =>
      [
        formatDate(row.date),
        row.type === "invoice" ? "Invoice" : "Payment",
        row.number,
        row.amount,
        row.paymentLabel,
        row.balance,
      ].join(","),
    ),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statement-${c.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
