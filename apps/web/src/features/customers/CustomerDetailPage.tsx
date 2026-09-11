import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  IndianRupee,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Receipt,
  StickyNote,
  Wallet,
} from "lucide-react";
import { Button, Input, Pagination, Surface } from "@/components/ui";
import {
  buildLedger,
  downloadStatement,
  formatDate,
  formatPhone,
  initialsFor,
  isWalkIn,
  paymentMethodLabel,
} from "@/features/customers/customerUtils";
import type { CustomerDetail, DetailTab } from "@/features/customers/types";
import { cn, formatINR } from "@/lib/cn";

type CustomerDetailPageProps = {
  detail: CustomerDetail;
  saving?: boolean;
  error?: string | null;
  onBack: () => void;
  onCollectPayment: (amount: number) => Promise<void>;
  onUpdateCustomer: (data: {
    name?: string;
    phone?: string;
    notes?: string;
    creditLimit?: number;
  }) => Promise<void>;
  onWhatsApp: () => void;
};

const TABS: Array<{ id: DetailTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "ledger", label: "Ledger" },
  { id: "sales", label: "Sales Invoices" },
  { id: "payments", label: "Payments" },
  { id: "notes", label: "Notes" },
  { id: "documents", label: "Documents" },
];

const RECENT_TXN_PAGE_SIZE = 4;
const LEDGER_PAGE_SIZE = 10;

export function CustomerDetailPage({
  detail,
  saving = false,
  error = null,
  onBack,
  onCollectPayment,
  onUpdateCustomer,
  onWhatsApp,
}: CustomerDetailPageProps) {
  const c = detail.customer;
  const [tab, setTab] = useState<DetailTab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [collectAmt, setCollectAmt] = useState(
    c.outstandingDue > 0 ? String(c.outstandingDue) : "",
  );
  const [editName, setEditName] = useState(c.name);
  const [editPhone, setEditPhone] = useState(c.phone ?? "");
  const [editNotes, setEditNotes] = useState(c.notes ?? "");
  const [editCreditLimit, setEditCreditLimit] = useState(
    c.creditLimit != null ? String(c.creditLimit) : "",
  );
  const txnRef = useRef<HTMLDivElement | null>(null);
  const [txnPage, setTxnPage] = useState(1);
  const [ledgerPage, setLedgerPage] = useState(1);

  const ledger = useMemo(() => buildLedger(detail), [detail]);
  const ledgerNewestFirst = useMemo(() => [...ledger].reverse(), [ledger]);
  const recentLedger = useMemo(() => {
    const start = (txnPage - 1) * RECENT_TXN_PAGE_SIZE;
    return ledgerNewestFirst.slice(start, start + RECENT_TXN_PAGE_SIZE);
  }, [ledgerNewestFirst, txnPage]);
  const ledgerPageRows = useMemo(() => {
    const start = (ledgerPage - 1) * LEDGER_PAGE_SIZE;
    return ledgerNewestFirst.slice(start, start + LEDGER_PAGE_SIZE);
  }, [ledgerNewestFirst, ledgerPage]);

  useEffect(() => {
    setTxnPage(1);
    setLedgerPage(1);
  }, [c._id]);

  const paidAmount = c.purchaseTotal - c.outstandingDue;

  async function handleCollect(e: FormEvent) {
    e.preventDefault();
    await onCollectPayment(Number(collectAmt));
    setPaymentOpen(false);
  }

  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    await onUpdateCustomer({
      name: editName.trim(),
      phone: editPhone || undefined,
      notes: editNotes || undefined,
      creditLimit: editCreditLimit ? Number(editCreditLimit) : undefined,
    });
    setEditOpen(false);
  }

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-medium text-ink-muted transition-colors hover:text-forest"
        >
          <ArrowLeft className="size-4" />
          Back to Customers
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Pencil className="size-4" />}
            onClick={() => setEditOpen(true)}
          >
            Edit
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Bell className="size-4" />}
            onClick={onWhatsApp}
            disabled={!c.phone}
          >
            Send Reminder
          </Button>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<MessageCircle className="size-4" />}
            onClick={onWhatsApp}
            disabled={!c.phone}
            className="!border-success/30 !text-success hover:!bg-success-soft"
          >
            WhatsApp
          </Button>
          <div className="relative" ref={txnRef}>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="size-4" />}
              rightIcon={<ChevronDown className="size-4" />}
              onClick={() => setTxnOpen((open) => !open)}
            >
              Add Transaction
            </Button>
            {txnOpen ? (
              <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-soft">
                <button
                  type="button"
                  className="block w-full px-3 py-2.5 text-left text-sm hover:bg-paper-2"
                  onClick={() => {
                    setTxnOpen(false);
                    setPaymentOpen(true);
                  }}
                >
                  Collect payment
                </button>
                <Link
                  to="/bill"
                  className="block px-3 py-2.5 text-sm hover:bg-paper-2"
                  onClick={() => setTxnOpen(false)}
                >
                  New bill
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Surface className="!p-0 overflow-hidden">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="inline-flex size-[72px] shrink-0 items-center justify-center rounded-2xl bg-success-soft text-2xl font-semibold text-forest">
              {initialsFor(c.name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
                  {c.name}
                </h1>
                {isWalkIn(c.name, c.phone) ? (
                  <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
                    Walk-in
                  </span>
                ) : null}
              </div>
              <div className="mt-3 space-y-1.5 text-sm text-ink-muted">
                <p className="flex items-center gap-2.5">
                  <Phone className="size-4 shrink-0 text-ink-muted/80" />
                  <span>{formatPhone(c.phone)}</span>
                </p>
                <p className="flex items-center gap-2.5">
                  <Mail className="size-4 shrink-0 text-ink-muted/80" />
                  <span>—</span>
                </p>
                <p className="flex items-center gap-2.5">
                  <MapPin className="size-4 shrink-0 text-ink-muted/80" />
                  <span>—</span>
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-success-soft px-3 py-1 text-xs font-medium text-success">
                  Since {formatDate(c.createdAt)}
                </span>
                <span className="rounded-full bg-paper-2 px-3 py-1 text-xs font-medium text-ink">
                  Total Sales: {formatINR(c.purchaseTotal)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:gap-6">
            <Metric label="Total Receivable" value={formatINR(c.outstandingDue)} tone="success" />
            <Metric label="Overdue Amount" value={formatINR(c.overdueAmount)} tone="danger" />
            <Metric label="Paid This Month" value={formatINR(c.paidThisMonth)} />
            <div>
              <p className="text-xs text-ink-muted">Credit Limit</p>
              <div className="mt-1 flex items-center gap-1.5">
                <p className="font-display text-xl font-semibold text-ink">
                  {c.creditLimit != null ? formatINR(c.creditLimit) : "—"}
                </p>
                <button
                  type="button"
                  className="text-ink-muted hover:text-forest"
                  aria-label="Edit credit limit"
                  onClick={() => setEditOpen(true)}
                >
                  <Pencil className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      <div className="border-b border-line">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                tab === item.id
                  ? "border-forest text-forest"
                  : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <div className="space-y-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <MiniStat
              icon={Receipt}
              iconClass="bg-forest/10 text-forest"
              label="Total Sales"
              value={formatINR(c.purchaseTotal)}
              hint={`${c.purchaseCount} Invoice${c.purchaseCount === 1 ? "" : "s"}`}
            />
            <MiniStat
              icon={Wallet}
              iconClass="bg-orange-100 text-orange-700"
              label="Total Receivable"
              value={formatINR(c.outstandingDue)}
              hint={`${c.receivableInvoices} Invoice${c.receivableInvoices === 1 ? "" : "s"}`}
            />
            <MiniStat
              icon={IndianRupee}
              iconClass="bg-success-soft text-success"
              label="Total Received"
              value={formatINR(c.totalReceived)}
              hint={`${detail.payments.length} Payment${detail.payments.length === 1 ? "" : "s"}`}
            />
          </section>

          <div className="grid gap-5 xl:grid-cols-[1.4fr_0.9fr]">
            <div className="space-y-5">
              <Surface padded={false} className="overflow-hidden">
                <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
                  <h2 className="font-semibold text-ink">Recent Transactions</h2>
                  <button
                    type="button"
                    className="text-sm font-medium text-forest hover:underline"
                    onClick={() => setTab("ledger")}
                  >
                    View All
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-line/70 text-xs font-medium uppercase tracking-wide text-ink-muted">
                        <th className="px-5 py-3">Type</th>
                        <th className="px-3 py-3">Number</th>
                        <th className="px-3 py-3">Date</th>
                        <th className="px-3 py-3">Amount</th>
                        <th className="px-3 py-3">Payment</th>
                        <th className="px-5 py-3">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {recentLedger.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-5 py-8 text-center text-ink-muted">
                            Abhi koi transaction nahi
                          </td>
                        </tr>
                      ) : (
                        recentLedger.map((row) => (
                          <tr key={row.id} className="hover:bg-paper-2/40">
                            <td className="px-5 py-3.5">
                              <TypeBadge type={row.type} />
                            </td>
                            <td className="px-3 py-3.5 font-medium text-ink">
                              {row.number}
                            </td>
                            <td className="px-3 py-3.5 text-ink-muted">
                              {formatDate(row.date)}
                            </td>
                            <td className="px-3 py-3.5 font-semibold text-ink">
                              {formatINR(row.amount)}
                            </td>
                            <td className="px-3 py-3.5 text-ink-muted">
                              {row.paymentLabel}
                            </td>
                            <td className="px-5 py-3.5 font-semibold text-ink">
                              {formatINR(row.balance)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={txnPage}
                  pageSize={RECENT_TXN_PAGE_SIZE}
                  total={ledgerNewestFirst.length}
                  noun="transactions"
                  onPageChange={setTxnPage}
                />
              </Surface>

              <Surface>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h2 className="font-semibold text-ink">Contact & GST Details</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="!h-9 border border-line"
                    leftIcon={<Pencil className="size-3.5" />}
                    onClick={() => setEditOpen(true)}
                  >
                    Edit
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <DetailField label="Phone" value={formatPhone(c.phone)} />
                  <DetailField label="Email" value="—" />
                  <DetailField label="GSTIN" value="—" />
                  <DetailField label="Address" value="—" />
                  <DetailField label="State" value="—" />
                  <DetailField label="Pincode" value="—" />
                </div>
              </Surface>
            </div>

            <div className="space-y-5">
              <Surface>
                <h2 className="mb-4 font-semibold text-ink">Account Summary</h2>
                <AccountDonut
                  paid={paidAmount}
                  pending={Math.max(0, c.outstandingDue - c.overdueAmount)}
                  overdue={c.overdueAmount}
                  balance={c.outstandingDue}
                  total={c.purchaseTotal}
                />
              </Surface>

              <Surface>
                <h2 className="mb-3 font-semibold text-ink">Quick Actions</h2>
                <div className="space-y-1">
                  <QuickActionRow
                    icon={IndianRupee}
                    label="Add Payment"
                    onClick={() => setPaymentOpen(true)}
                  />
                  <QuickActionRow
                    icon={BookOpen}
                    label="View Ledger"
                    onClick={() => setTab("ledger")}
                  />
                  <QuickActionRow
                    icon={FileText}
                    label="Send Statement"
                    onClick={onWhatsApp}
                    disabled={!c.phone}
                  />
                  <QuickActionRow
                    icon={Download}
                    label="Download Statement"
                    onClick={() => downloadStatement(detail)}
                  />
                </div>
              </Surface>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "ledger" ? (
        <Surface padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line/70 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3">Type</th>
                  <th className="px-3 py-3">Number</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Payment</th>
                  <th className="px-5 py-3">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {ledgerPageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-ink-muted">
                      Abhi koi transaction nahi
                    </td>
                  </tr>
                ) : (
                  ledgerPageRows.map((row) => (
                  <tr key={row.id} className="hover:bg-paper-2/40">
                    <td className="px-5 py-3.5">
                      <TypeBadge type={row.type} />
                    </td>
                    <td className="px-3 py-3.5 font-medium">{row.number}</td>
                    <td className="px-3 py-3.5 text-ink-muted">
                      {formatDate(row.date)}
                    </td>
                    <td className="px-3 py-3.5 font-semibold">
                      {formatINR(row.amount)}
                    </td>
                    <td className="px-3 py-3.5 text-ink-muted">
                      {row.paymentLabel}
                    </td>
                    <td className="px-5 py-3.5 font-semibold">
                      {formatINR(row.balance)}
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={ledgerPage}
            pageSize={LEDGER_PAGE_SIZE}
            total={ledgerNewestFirst.length}
            noun="transactions"
            onPageChange={setLedgerPage}
          />
        </Surface>
      ) : null}

      {tab === "sales" ? (
        <Surface padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-line/70 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3">Invoice</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Amount</th>
                  <th className="px-3 py-3">Paid</th>
                  <th className="px-3 py-3">Due</th>
                  <th className="px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {detail.sales.map((sale) => (
                  <tr key={sale._id} className="hover:bg-paper-2/40">
                    <td className="px-5 py-3.5 font-semibold text-forest">
                      <Link to={`/invoice/${sale._id}`} className="hover:underline">
                        {sale.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3.5 text-ink-muted">
                      {formatDate(sale.completedAt)}
                    </td>
                    <td className="px-3 py-3.5 font-semibold">
                      {formatINR(sale.total)}
                    </td>
                    <td className="px-3 py-3.5">{formatINR(sale.amountPaid)}</td>
                    <td
                      className={cn(
                        "px-3 py-3.5 font-semibold",
                        sale.amountDue > 0 ? "text-orange-700" : "text-success",
                      )}
                    >
                      {formatINR(sale.amountDue)}
                    </td>
                    <td className="px-5 py-3.5">
                      <Link
                        to={`/invoice/${sale._id}`}
                        className="text-sm font-medium text-forest hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : null}

      {tab === "payments" ? (
        <Surface padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-line/70 text-xs font-medium uppercase tracking-wide text-ink-muted">
                  <th className="px-5 py-3">Reference</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Method</th>
                  <th className="px-5 py-3">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {detail.payments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-ink-muted">
                      Abhi koi payment nahi
                    </td>
                  </tr>
                ) : (
                  detail.payments.map((payment) => (
                    <tr key={payment._id} className="hover:bg-paper-2/40">
                      <td className="px-5 py-3.5 font-medium">{payment.reference}</td>
                      <td className="px-3 py-3.5 text-ink-muted">
                        {formatDate(payment.receivedAt ?? null)}
                      </td>
                      <td className="px-3 py-3.5">
                        {paymentMethodLabel(payment.method)}
                      </td>
                      <td className="px-5 py-3.5 font-semibold">
                        {formatINR(payment.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Surface>
      ) : null}

      {tab === "notes" ? (
        <Surface>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <StickyNote className="size-5 text-forest" />
              <h2 className="font-semibold text-ink">Customer Notes</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="!h-9 border border-line"
              leftIcon={<Pencil className="size-3.5" />}
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
          </div>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-muted">
            {c.notes?.trim() ? c.notes : "Koi note nahi — Edit pe click karke add karo."}
          </p>
        </Surface>
      ) : null}

      {tab === "documents" ? (
        <Surface className="py-12 text-center">
          <FileText className="mx-auto size-10 text-ink-muted/50" />
          <p className="mt-3 font-medium text-ink">Documents</p>
          <p className="mt-1 text-sm text-ink-muted">
            GST certificate, agreements aur documents yahan upload honge.
          </p>
        </Surface>
      ) : null}

      {paymentOpen ? (
        <Modal title="Collect payment" onClose={() => setPaymentOpen(false)}>
          <form className="space-y-3" onSubmit={handleCollect}>
            <Input
              label="Amount (₹)"
              inputMode="decimal"
              value={collectAmt}
              onChange={(e) => setCollectAmt(e.target.value)}
              required
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setPaymentOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" fullWidth loading={saving}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editOpen ? (
        <Modal title="Edit customer" onClose={() => setEditOpen(false)}>
          <form className="space-y-3" onSubmit={handleEdit}>
            <Input
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
            />
            <Input
              label="Phone"
              value={editPhone}
              onChange={(e) =>
                setEditPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
            />
            <Input
              label="Credit limit (₹)"
              inputMode="decimal"
              value={editCreditLimit}
              onChange={(e) => setEditCreditLimit(e.target.value)}
            />
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-ink">Notes</span>
              <textarea
                className="min-h-24 w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </label>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setEditOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" fullWidth loading={saving}>
                Save
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-xl font-semibold",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          !tone && "text-ink",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
}: {
  icon: typeof Receipt;
  iconClass: string;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Surface className="space-y-3">
      <span
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-xl",
          iconClass,
        )}
      >
        <Icon className="size-4" />
      </span>
      <div>
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
          {value}
        </p>
      </div>
      <p className="text-xs font-medium text-ink-muted">{hint}</p>
    </Surface>
  );
}

function TypeBadge({ type }: { type: "invoice" | "payment" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
        type === "invoice"
          ? "bg-success-soft text-success"
          : "bg-sky-100 text-sky-700",
      )}
    >
      {type === "invoice" ? "Invoice" : "Payment"}
    </span>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  );
}

function QuickActionRow({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: typeof FileText;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-paper-2 disabled:opacity-50"
    >
      <span className="inline-flex items-center gap-3 text-sm font-medium text-ink">
        <Icon className="size-4 text-forest" />
        {label}
      </span>
      <ChevronRight className="size-4 text-ink-muted" />
    </button>
  );
}

function AccountDonut({
  paid,
  pending,
  overdue,
  balance,
  total,
}: {
  paid: number;
  pending: number;
  overdue: number;
  balance: number;
  total: number;
}) {
  const segments = [
    { label: "Paid", value: paid, color: "#16a34a" },
    { label: "Pending", value: pending, color: "#f59e0b" },
    { label: "Overdue", value: overdue, color: "#dc2626" },
  ].filter((s) => s.value > 0);

  const sum = segments.reduce((acc, s) => acc + s.value, 0) || total || 1;
  let offset = 0;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke="#eef2f0"
            strokeWidth="10"
          />
          {segments.map((segment) => {
            const dash = (segment.value / sum) * circumference;
            const circle = (
              <circle
                key={segment.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="10"
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            );
            offset += dash;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xs text-ink-muted">Balance</p>
          <p className="font-display text-lg font-semibold text-ink">
            {formatINR(balance)}
          </p>
        </div>
      </div>
      <div className="w-full space-y-2 text-sm">
        {segments.map((segment) => (
          <div key={segment.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-ink-muted">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              {segment.label}
            </span>
            <span className="font-medium text-ink">{formatINR(segment.value)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-line/70 pt-2 font-semibold text-ink">
          <span>Total</span>
          <span>{formatINR(total)}</span>
        </div>
      </div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
