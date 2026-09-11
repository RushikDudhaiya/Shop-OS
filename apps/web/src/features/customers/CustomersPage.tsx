import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  Bell,
  FileText,
  Filter,
  IndianRupee,
  MessageCircle,
  MoreVertical,
  Search,
  Upload,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  EmptyState,
  Input,
  PageLoader,
  Pagination,
  Surface,
} from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { CustomerDetailPage } from "@/features/customers/CustomerDetailPage";
import {
  formatDate,
  formatPhone,
  initialsFor,
  isWalkIn,
  OVERDUE_DAYS,
} from "@/features/customers/customerUtils";
import type {
  CustomerDetail,
  CustomerListResponse,
  CustomerRow,
  CustomerSummary,
  PaymentStatus,
} from "@/features/customers/types";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";

const PAGE_SIZE = 5;

type CustomerFilter = "all" | "has_due" | "walk_in";
type StatusFilter = "all" | PaymentStatus;

function paymentStatus(row: CustomerRow): PaymentStatus {
  if (row.outstandingDue <= 0) return "paid";
  if (row.lastPurchaseAt) {
    const days =
      (Date.now() - new Date(row.lastPurchaseAt).getTime()) / 86_400_000;
    if (days > OVERDUE_DAYS) return "overdue";
  }
  if (row.purchaseTotal > row.outstandingDue) return "partial";
  return "due";
}

function statusLabel(status: PaymentStatus) {
  const map: Record<PaymentStatus, string> = {
    paid: "Paid",
    partial: "Partial",
    due: "Due",
    overdue: "Overdue",
  };
  return map[status];
}

function statusTone(status: PaymentStatus) {
  switch (status) {
    case "paid":
      return "bg-success-soft text-success";
    case "partial":
      return "bg-orange-100 text-orange-700";
    case "due":
      return "bg-pink-100 text-pink-700";
    case "overdue":
      return "bg-danger-soft text-danger";
  }
}

function growthLabel(pct: number | null) {
  if (pct === null) return "No prior month data";
  if (pct === 0) return "Same as last month";
  const arrow = pct > 0 ? "↑" : "↓";
  return `${arrow} ${Math.abs(pct)}% vs last month`;
}

export function CustomersPage() {
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [menuId, setMenuId] = useState<string | null>(null);
  const menuAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, customerFilter, statusFilter]);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    try {
      const data = await api<CustomerListResponse>(
        `/api/shops/${shopId}/customers?q=${encodeURIComponent(debouncedQ)}`,
      );
      setRows(data.customers);
      setSummary(data.summary);
    } finally {
      setLoading(false);
    }
  }, [shopId, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return rows.filter((row) => {
      if (customerFilter === "has_due" && row.outstandingDue <= 0) return false;
      if (customerFilter === "walk_in" && !isWalkIn(row.name, row.phone)) {
        return false;
      }
      if (statusFilter !== "all" && paymentStatus(row) !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [rows, customerFilter, statusFilter]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  async function openDetail(id: string) {
    if (!shopId) return;
    setSelectedId(id);
    setDetailLoading(true);
    setError(null);
    try {
      const data = await api<CustomerDetail>(
        `/api/shops/${shopId}/customers/${id}`,
      );
      setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  }

  async function refreshDetail() {
    if (!shopId || !selectedId) return;
    const data = await api<CustomerDetail>(
      `/api/shops/${shopId}/customers/${selectedId}`,
    );
    setDetail(data);
    await load();
  }

  async function updateCustomer(data: {
    name?: string;
    phone?: string;
    notes?: string;
    creditLimit?: number;
  }) {
    if (!shopId || !selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shops/${shopId}/customers/${selectedId}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      });
      await refreshDetail();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Update fail",
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function collectUdhaar(amount: number) {
    if (!shopId || !selectedId) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shops/${shopId}/customers/${selectedId}/payments`, {
        method: "POST",
        body: JSON.stringify({
          method: "CASH",
          amount,
          receivedAmount: amount,
          idempotencyKey: crypto.randomUUID().replace(/-/g, "").slice(0, 24),
        }),
      });
      await refreshDetail();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Collect fail",
      );
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function createCustomer(e: FormEvent) {
    e.preventDefault();
    if (!shopId) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/shops/${shopId}/customers`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          phone: phone || undefined,
        }),
      });
      setAddOpen(false);
      setName("");
      setPhone("");
      await load();
    } catch (err) {
      setError(
        err instanceof ApiRequestError ? err.body.message : "Create fail",
      );
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    if (!rows.length) return;
    const header = [
      "Name",
      "Phone",
      "Total Sales",
      "Pending",
      "Purchases",
      "Last Purchase",
    ];
    const lines = rows.map((c) => [
      c.name,
      c.phone ?? "",
      String(c.purchaseTotal),
      String(c.outstandingDue),
      String(c.purchaseCount),
      c.lastPurchaseAt ?? "",
    ]);
    const csv = [header, ...lines]
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function openWhatsApp(target: { phone: string | null }) {
    if (!target.phone) return;
    const digits = target.phone.replace(/\D/g, "");
    const num = digits.length === 10 ? `91${digits}` : digits;
    window.open(`https://wa.me/${num}`, "_blank", "noopener,noreferrer");
  }

  if (!shopId) return <PageLoader />;

  if (detailLoading && selectedId) return <PageLoader />;

  if (detail && selectedId) {
    return (
      <CustomerDetailPage
        detail={detail}
        saving={saving}
        error={error}
        onBack={() => {
          setSelectedId(null);
          setDetail(null);
          setError(null);
        }}
        onCollectPayment={collectUdhaar}
        onUpdateCustomer={updateCustomer}
        onWhatsApp={() => openWhatsApp(detail.customer)}
      />
    );
  }

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-forest md:text-4xl">
            Customers
          </h1>
          <p className="mt-1 text-sm text-ink-muted md:text-base">
            Walk-in default. Yahan udhaar wale.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            variant="secondary"
            leftIcon={<Upload className="size-4" />}
            onClick={exportCsv}
            disabled={!rows.length}
          >
            Export
          </Button>
          <Button
            variant="primary"
            leftIcon={<UserPlus className="size-4" />}
            onClick={() => {
              setAddOpen(true);
              setError(null);
            }}
          >
            Add Customer
          </Button>
        </div>
      </header>

      {loading && !summary ? (
        <PageLoader />
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={Users}
              iconClass="bg-forest/10 text-forest"
              label="Total Customers"
              value={String(summary?.totalCustomers ?? 0)}
              footer={
                summary?.newThisMonth
                  ? `↑ ${summary.newThisMonth} this month`
                  : "No new customers this month"
              }
              footerClass="text-success"
            />
            <StatCard
              icon={Wallet}
              iconClass="bg-sky-100 text-sky-700"
              label="Total Receivable"
              value={formatINR(summary?.totalReceivable ?? 0)}
              footer={`${summary?.receivableCustomerCount ?? 0} customers`}
            />
            <StatCard
              icon={AlertTriangle}
              iconClass="bg-danger-soft text-danger"
              label="Overdue Amount"
              value={formatINR(summary?.overdueAmount ?? 0)}
              footer={`${summary?.overdueCustomerCount ?? 0} customers`}
              footerClass="text-danger"
            />
            <StatCard
              icon={IndianRupee}
              iconClass="bg-success-soft text-success"
              label="Received This Month"
              value={formatINR(summary?.receivedThisMonth ?? 0)}
              footer={growthLabel(summary?.receivedGrowthPct ?? null)}
              footerClass="text-success"
            />
          </section>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by name, phone, GSTIN, email..."
                className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-sm text-ink shadow-soft placeholder:text-ink-muted/70"
              />
            </label>

            <select
              className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-soft"
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value as CustomerFilter)}
            >
              <option value="all">All Customers</option>
              <option value="has_due">Has Udhaar</option>
              <option value="walk_in">Walk-in</option>
            </select>

            <select
              className="h-11 rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-soft"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">Payment Status</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="due">Due</option>
              <option value="overdue">Overdue</option>
            </select>

            <Button
              variant="secondary"
              leftIcon={<Filter className="size-4" />}
              onClick={() => setStatusFilter("overdue")}
            >
              More Filters
            </Button>
          </div>

          <Surface padded={false} className="overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState
                icon={<Users className="size-7" />}
                title={
                  q || customerFilter !== "all" || statusFilter !== "all"
                    ? "Koi match nahi"
                    : "Koi customer nahi"
                }
                description="Udhaar sale pe customer auto-create hota hai, ya naya add karo."
                actionLabel="Add Customer"
                onAction={() => setAddOpen(true)}
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-line/70 text-xs font-medium uppercase tracking-wide text-ink-muted">
                        <th className="px-5 py-3 font-medium">Customer</th>
                        <th className="px-3 py-3 font-medium">Phone</th>
                        <th className="px-3 py-3 font-medium">Total Sales</th>
                        <th className="px-3 py-3 font-medium">Pending Amount</th>
                        <th className="px-3 py-3 font-medium">Last Transaction</th>
                        <th className="px-3 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line/60">
                      {pageRows.map((row) => {
                        const status = paymentStatus(row);
                        return (
                          <tr key={row._id} className="hover:bg-paper-2/40">
                            <td className="px-5 py-3.5">
                              <CustomerCell row={row} />
                            </td>
                            <td className="px-3 py-3.5 text-ink-muted">
                              {formatPhone(row.phone)}
                            </td>
                            <td className="px-3 py-3.5 font-semibold text-ink">
                              {formatINR(row.purchaseTotal)}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-3.5 font-semibold",
                                row.outstandingDue > 0
                                  ? "text-orange-700"
                                  : "text-success",
                              )}
                            >
                              {formatINR(row.outstandingDue)}
                            </td>
                            <td className="px-3 py-3.5">
                              <p className="text-ink">{formatDate(row.lastPurchaseAt)}</p>
                              {row.lastInvoiceNumber ? (
                                <p className="text-xs text-ink-muted">
                                  {row.lastInvoiceNumber}
                                </p>
                              ) : null}
                            </td>
                            <td className="px-3 py-3.5">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                  statusTone(status),
                                )}
                              >
                                {statusLabel(status)}
                              </span>
                            </td>
                            <td className="relative px-5 py-3.5 text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-paper-2 hover:text-ink"
                                  aria-label="Customer statement"
                                  onClick={() => void openDetail(row._id)}
                                >
                                  <FileText className="size-4" />
                                </button>
                                <div
                                  ref={(el) => {
                                    if (menuId === row._id) {
                                      menuAnchorRef.current = el;
                                    }
                                  }}
                                  className="inline-block"
                                >
                                  <button
                                    type="button"
                                    className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-paper-2 hover:text-ink"
                                    aria-label="Customer actions"
                                    onClick={() =>
                                      setMenuId((id) =>
                                        id === row._id ? null : row._id,
                                      )
                                    }
                                  >
                                    <MoreVertical className="size-4" />
                                  </button>
                                </div>
                                <DropdownMenu
                                  open={menuId === row._id}
                                  onClose={() => setMenuId(null)}
                                  anchorRef={menuAnchorRef}
                                  className="w-44"
                                >
                                  <button
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
                                    onClick={() => {
                                      setMenuId(null);
                                      void openDetail(row._id);
                                    }}
                                  >
                                    View statement
                                  </button>
                                  {row.phone ? (
                                    <button
                                      type="button"
                                      className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
                                      onClick={() => {
                                        setMenuId(null);
                                        openWhatsApp(row);
                                      }}
                                    >
                                      WhatsApp message
                                    </button>
                                  ) : null}
                                  {row.outstandingDue > 0 ? (
                                    <button
                                      type="button"
                                      className="block w-full px-3 py-2 text-left text-sm hover:bg-paper-2"
                                      onClick={() => {
                                        setMenuId(null);
                                        void openDetail(row._id);
                                      }}
                                    >
                                      Collect udhaar
                                    </button>
                                  ) : null}
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <ul className="divide-y divide-line/60 md:hidden">
                  {pageRows.map((row) => {
                    const status = paymentStatus(row);
                    return (
                      <li key={row._id}>
                        <button
                          type="button"
                          className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-paper-2/40"
                          onClick={() => void openDetail(row._id)}
                        >
                          <CustomerAvatar name={row.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-semibold text-ink">{row.name}</p>
                                <p className="text-xs text-ink-muted">
                                  {formatPhone(row.phone)}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                                  statusTone(status),
                                )}
                              >
                                {statusLabel(status)}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
                              <span>Sales {formatINR(row.purchaseTotal)}</span>
                              <span
                                className={
                                  row.outstandingDue > 0
                                    ? "font-medium text-orange-700"
                                    : "text-success"
                                }
                              >
                                Pending {formatINR(row.outstandingDue)}
                              </span>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <Pagination
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={filtered.length}
                  noun="customers"
                  onPageChange={setPage}
                />
              </>
            )}
          </Surface>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <QuickActionCard
              icon={FileText}
              iconClass="bg-forest/10 text-forest"
              title="Customer Statement"
              description="View customer ledger"
              onClick={() => {
                if (pageRows[0]) void openDetail(pageRows[0]._id);
              }}
            />
            <QuickActionCard
              icon={Bell}
              iconClass="bg-orange-100 text-orange-700"
              title="Send Reminder"
              description="Send payment reminder"
              onClick={() => setStatusFilter("overdue")}
            />
            <QuickActionCard
              icon={MessageCircle}
              iconClass="bg-success-soft text-success"
              title="WhatsApp Message"
              description="Message to customer"
              onClick={() => {
                const withPhone = rows.find((r) => r.phone);
                if (withPhone) openWhatsApp(withPhone);
              }}
            />
            <QuickActionCard
              icon={Users}
              iconClass="bg-violet-100 text-violet-700"
              title="Customer Groups"
              description="Manage customer groups"
              onClick={() => setAddOpen(true)}
            />
          </section>
        </>
      )}

      {addOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setAddOpen(false)}
        >
          <form
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
            onSubmit={createCustomer}
          >
            <h2 className="text-lg font-semibold">Add customer</h2>
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
            <Input
              label="Phone (optional)"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
              }
            />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setAddOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="gold" fullWidth loading={saving}>
                Save
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function CustomerAvatar({ name }: { name: string }) {
  return (
    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-forest/10 text-sm font-semibold text-forest">
      {initialsFor(name)}
    </span>
  );
}

function CustomerCell({ row }: { row: CustomerRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CustomerAvatar name={row.name} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-ink">{row.name}</p>
          {isWalkIn(row.name, row.phone) ? (
            <span className="rounded-full bg-paper-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
              Walk-in
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  iconClass,
  label,
  value,
  footer,
  footerClass,
}: {
  icon: typeof Users;
  iconClass: string;
  label: string;
  value: string;
  footer: string;
  footerClass?: string;
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
      <p className={cn("text-xs font-medium text-ink-muted", footerClass)}>
        {footer}
      </p>
    </Surface>
  );
}

function QuickActionCard({
  icon: Icon,
  iconClass,
  title,
  description,
  onClick,
}: {
  icon: typeof FileText;
  iconClass: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-2xl border border-line bg-white p-4 text-left shadow-soft transition-colors hover:bg-paper-2/50"
    >
      <span
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-xl",
          iconClass,
        )}
      >
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-ink-muted">{description}</p>
      </div>
    </button>
  );
}
