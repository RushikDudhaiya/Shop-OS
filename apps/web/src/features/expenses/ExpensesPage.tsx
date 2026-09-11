import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { EXPENSE_CATEGORIES } from "@shop-os/shared";
import {
  CalendarDays,
  ClipboardList,
  Download,
  LayoutGrid,
  Lightbulb,
  MoreHorizontal,
  Plus,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Button,
  EmptyState,
  Input,
  PageLoader,
  Pagination,
  Surface,
} from "@/components/ui";
import { useAuth } from "@/features/auth/AuthContext";
import { api, ApiRequestError } from "@/lib/api";
import { cn, formatINR } from "@/lib/cn";

type Expense = {
  _id: string;
  category: string;
  amount: number;
  paymentMethod: string;
  note: string | null;
  spentAt: string;
};

type CategorySlice = {
  category: string;
  amount: number;
  pct: number;
};

type Summary = {
  total: number;
  count: number;
  avgDaily: number;
  highestAmount: number;
  highestCategory: string | null;
  lastMonthTotal: number;
  vsLastMonthPct: number | null;
  days: number;
};

type ExpensesResponse = {
  summary: Summary;
  byCategory: CategorySlice[];
  items: Expense[];
  page: number;
  pageSize: number;
  totalCount: number;
};

const PAGE_SIZE = 8;
const DEFAULT_BUDGET = 5000;

const CATEGORY_COLORS: Record<string, string> = {
  Rent: "#1e7a4a",
  Electricity: "#0284c7",
  "Salary/Wages": "#7c3aed",
  Transport: "#d49a00",
  "Tea/Food": "#ea580c",
  Repairs: "#0f766e",
  Other: "#6b7280",
};

function categoryColor(category: string) {
  return CATEGORY_COLORS[category] ?? "#6b7280";
}

function categoryBadgeClass(category: string) {
  switch (category) {
    case "Rent":
      return "bg-success-soft text-success";
    case "Electricity":
      return "bg-sky-100 text-sky-700";
    case "Salary/Wages":
      return "bg-violet-100 text-violet-700";
    case "Transport":
      return "bg-gold/25 text-ink";
    case "Tea/Food":
      return "bg-orange-100 text-orange-700";
    case "Repairs":
      return "bg-teal-100 text-teal-800";
    default:
      return "bg-paper-2 text-ink-muted";
  }
}

function paymentLabel(method: string) {
  if (method === "BANK") return "Bank Transfer";
  if (method === "CASH") return "Cash";
  if (method === "UPI") return "UPI";
  return method;
}

function paymentTone(method: string) {
  switch (method) {
    case "CASH":
      return "bg-success-soft text-success";
    case "UPI":
      return "bg-sky-100 text-sky-700";
    case "BANK":
      return "bg-violet-100 text-violet-700";
    default:
      return "bg-paper-2 text-ink-muted";
  }
}

function toDateInput(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatExpenseDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function budgetKey(shopId: string) {
  return `shop_os_expense_budget_${shopId}`;
}

function vsLastMonthLabel(pct: number | null) {
  if (pct === null) return "No prior month data";
  if (pct === 0) return "Same as last month";
  if (pct < 0) return `↓ ${Math.abs(pct)}% less than last month`;
  return `↑ ${pct}% more than last month`;
}

function DonutChart({ slices }: { slices: CategorySlice[] }) {
  const size = 180;
  const stroke = 28;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (slices.length === 0) {
    return (
      <div className="flex size-[180px] items-center justify-center rounded-full border-[28px] border-paper-2 text-sm text-ink-muted">
        No data
      </div>
    );
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      {slices.map((slice) => {
        const len = (slice.pct / 100) * circumference;
        const dash = `${len} ${circumference - len}`;
        const el = (
          <circle
            key={slice.category}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={categoryColor(slice.category)}
            strokeWidth={stroke}
            strokeDasharray={dash}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

export function ExpensesPage() {
  const { activeShop } = useAuth();
  const shopId = activeShop?._id;
  const now = useMemo(() => new Date(), []);

  const [from, setFrom] = useState(() =>
    toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [to, setTo] = useState(() => toDateInput(now));
  const [categoryFilter, setCategoryFilter] = useState("");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [showAll, setShowAll] = useState(false);

  const [data, setData] = useState<ExpensesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");

  const [open, setOpen] = useState(false);
  const [category, setCategory] =
    useState<(typeof EXPENSE_CATEGORIES)[number]>("Other");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<"CASH" | "UPI" | "BANK">("CASH");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [menuId, setMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!shopId) return;
    const raw = localStorage.getItem(budgetKey(shopId));
    const n = raw ? Number(raw) : DEFAULT_BUDGET;
    setBudget(Number.isFinite(n) && n > 0 ? n : DEFAULT_BUDGET);
  }, [shopId]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setPage(1);
    setShowAll(false);
  }, [from, to, categoryFilter, debouncedQ]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(showAll ? 50 : PAGE_SIZE),
        from,
        to,
      });
      if (categoryFilter) params.set("category", categoryFilter);
      if (debouncedQ) params.set("q", debouncedQ);
      const res = await api<ExpensesResponse>(
        `/api/shops/${shopId}/expenses?${params}`,
      );
      setData(res);
    } catch {
      setError("Kharcha load nahi ho paya");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [shopId, page, from, to, categoryFilter, debouncedQ, showAll]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = data?.summary;
  const items = data?.items ?? [];
  const byCategory = data?.byCategory ?? [];
  const totalCount = data?.totalCount ?? 0;
  const pageSize = data?.pageSize ?? PAGE_SIZE;

  const budgetUsedPct =
    budget > 0
      ? Math.min(100, Math.round(((summary?.total ?? 0) / budget) * 100))
      : 0;
  const remaining = Math.max(0, budget - (summary?.total ?? 0));

  function saveBudget() {
    if (!shopId) return;
    const n = Number(budgetDraft);
    if (!Number.isFinite(n) || n <= 0) return;
    setBudget(n);
    localStorage.setItem(budgetKey(shopId), String(n));
    setEditingBudget(false);
  }

  function exportCsv() {
    if (!items.length) return;
    const header = ["Date", "Description", "Category", "Amount", "Payment"];
    const rows = items.map((e) => [
      e.spentAt.slice(0, 10),
      e.note ?? e.category,
      e.category,
      String(e.amount),
      paymentLabel(e.paymentMethod),
    ]);
    const csv = [header, ...rows]
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kharcha-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!shopId) return;
    setSaving(true);
    setFormError(null);
    try {
      await api(`/api/shops/${shopId}/expenses`, {
        method: "POST",
        body: JSON.stringify({
          category,
          amount: Number(amount),
          paymentMethod: method,
          note: note || undefined,
        }),
      });
      setOpen(false);
      setAmount("");
      setNote("");
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError ? err.body.message : "Save fail",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(id: string) {
    if (!shopId) return;
    setMenuId(null);
    try {
      await api(`/api/shops/${shopId}/expenses/${id}`, { method: "DELETE" });
      await load();
    } catch {
      setError("Delete fail");
    }
  }

  if (!shopId) return <PageLoader />;

  const vsPct = summary?.vsLastMonthPct ?? null;

  return (
    <div className="w-full space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl md:text-4xl">
            Kharcha (Expenses)
          </h1>
          <p className="mt-1 text-sm text-ink-muted md:text-base">
            Apne saare kharche yahan record karein aur track karein.
          </p>
        </div>
        <Button
          variant="gold"
          className="w-full sm:w-auto"
          leftIcon={<Plus className="size-4" />}
          onClick={() => setOpen(true)}
        >
          Naya Kharcha
        </Button>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="flex w-full flex-col gap-2 rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-ink shadow-soft sm:inline-flex sm:h-11 sm:w-auto sm:flex-row sm:items-center sm:gap-2 sm:py-0">
          <CalendarDays className="size-4 shrink-0 text-forest" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <input
              type="date"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none sm:w-[9.5rem] sm:flex-none"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
            <span className="text-ink-muted">-</span>
            <input
              type="date"
              className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none sm:w-[9.5rem] sm:flex-none"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </label>

        <select
          className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-soft lg:w-auto"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search expense or description"
            className="h-11 w-full rounded-xl border border-line bg-white pl-10 pr-3 text-sm text-ink shadow-soft placeholder:text-ink-muted/70"
          />
        </label>

        <Button
          variant="secondary"
          leftIcon={<Download className="size-4" />}
          onClick={exportCsv}
          disabled={!items.length}
        >
          Export
        </Button>
      </div>

      {loading && !data ? (
        <PageLoader />
      ) : error && !data ? (
        <Surface>
          <p className="text-sm text-danger">{error}</p>
        </Surface>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Surface className="space-y-3">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-success-soft text-success">
                <Wallet className="size-4" />
              </span>
              <div>
                <p className="text-sm text-ink-muted">Total Kharcha</p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink">
                  {formatINR(summary?.total ?? 0)}
                </p>
              </div>
              <p className="text-xs text-ink-muted">
                {summary?.count ?? 0} transactions
              </p>
              <p
                className={cn(
                  "text-xs font-medium",
                  vsPct === null
                    ? "text-ink-muted"
                    : vsPct <= 0
                      ? "text-success"
                      : "text-danger",
                )}
              >
                {vsLastMonthLabel(vsPct)}
              </p>
            </Surface>

            <Surface className="space-y-3">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <TrendingUp className="size-4" />
              </span>
              <div>
                <p className="text-sm text-ink-muted">Average Daily Expense</p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink">
                  {formatINR(summary?.avgDaily ?? 0)}
                </p>
              </div>
              <p className="text-xs text-ink-muted">per day</p>
            </Surface>

            <Surface className="space-y-3">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <LayoutGrid className="size-4" />
              </span>
              <div>
                <p className="text-sm text-ink-muted">Highest Expense</p>
                <p className="mt-1 font-display text-2xl font-semibold text-ink">
                  {formatINR(summary?.highestAmount ?? 0)}
                </p>
              </div>
              <p className="text-xs text-ink-muted">
                {summary?.highestCategory ?? "—"}
              </p>
            </Surface>

            <Surface className="space-y-3">
              <span className="inline-flex size-9 items-center justify-center rounded-xl bg-gold/25 text-ink">
                <ClipboardList className="size-4" />
              </span>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm text-ink-muted">This Month Budget</p>
                  <p className="mt-1 font-display text-2xl font-semibold text-ink">
                    {formatINR(budget)}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs font-medium text-forest hover:underline"
                  onClick={() => {
                    setBudgetDraft(String(budget));
                    setEditingBudget(true);
                  }}
                >
                  Edit
                </button>
              </div>
              <p className="text-xs text-ink-muted">{budgetUsedPct}% used</p>
              <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    budgetUsedPct >= 90 ? "bg-danger" : "bg-gold",
                  )}
                  style={{ width: `${budgetUsedPct}%` }}
                />
              </div>
            </Surface>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="space-y-4">
              <Surface className="space-y-4">
                <h2 className="text-base font-semibold text-ink">
                  Kharcha by Category
                </h2>
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                  <DonutChart slices={byCategory} />
                  <ul className="w-full flex-1 space-y-2.5">
                    {byCategory.length === 0 ? (
                      <li className="text-sm text-ink-muted">
                        Is range mein category data nahi
                      </li>
                    ) : (
                      byCategory.map((slice) => (
                        <li
                          key={slice.category}
                          className="flex items-center justify-between gap-2 text-sm"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{
                                backgroundColor: categoryColor(slice.category),
                              }}
                            />
                            <span className="truncate font-medium text-ink">
                              {slice.category}
                            </span>
                          </span>
                          <span className="shrink-0 text-ink-muted">
                            {formatINR(slice.amount)}{" "}
                            <span className="text-xs">({slice.pct}%)</span>
                          </span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </Surface>

              <div className="flex items-start gap-3 rounded-2xl border border-success/20 bg-success-soft/60 px-4 py-3.5 text-sm text-success">
                <Lightbulb className="mt-0.5 size-4 shrink-0" />
                <p>
                  Tip: Regular tracking se aap unnecessary kharchon ko control
                  kar sakte hain.
                </p>
              </div>

              <Surface className="space-y-4">
                <h2 className="text-base font-semibold text-ink">
                  Monthly Budget Overview
                </h2>
                <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
                  <div className="min-w-0 rounded-xl bg-paper-2/40 px-2 py-2 sm:bg-transparent sm:px-0 sm:py-0">
                    <p className="text-[11px] text-ink-muted sm:text-xs">Budget</p>
                    <p className="mt-1 text-sm font-semibold break-words text-ink sm:text-base">
                      {formatINR(budget)}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-paper-2/40 px-2 py-2 sm:bg-transparent sm:px-0 sm:py-0">
                    <p className="text-[11px] text-ink-muted sm:text-xs">Spent</p>
                    <p className="mt-1 text-sm font-semibold break-words text-ink sm:text-base">
                      {formatINR(summary?.total ?? 0)}
                    </p>
                  </div>
                  <div className="min-w-0 rounded-xl bg-paper-2/40 px-2 py-2 sm:bg-transparent sm:px-0 sm:py-0">
                    <p className="text-[11px] text-ink-muted sm:text-xs">Remaining</p>
                    <p className="mt-1 text-sm font-semibold break-words text-success sm:text-base">
                      {formatINR(remaining)}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="mb-1.5 flex justify-between text-xs text-ink-muted">
                    <span>{budgetUsedPct}% used</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-paper-2">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        budgetUsedPct >= 90 ? "bg-danger" : "bg-leaf",
                      )}
                      style={{ width: `${budgetUsedPct}%` }}
                    />
                  </div>
                </div>
              </Surface>
            </div>

            <Surface padded={false} className="flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-3 border-b border-line/70 px-5 py-4">
                <h2 className="text-base font-semibold text-ink">
                  Recent Expenses
                </h2>
                {totalCount > PAGE_SIZE ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-forest hover:underline"
                    onClick={() => {
                      setShowAll(true);
                      setPage(1);
                    }}
                  >
                    View all →
                  </button>
                ) : null}
              </div>

              {items.length === 0 ? (
                <EmptyState
                  icon={<Wallet className="size-7" />}
                  title="Abhi koi kharcha nahi"
                  description="Chai, bijli, rent — yahan jot lo."
                  actionLabel="Naya Kharcha"
                  onAction={() => setOpen(true)}
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-line/70 text-xs font-medium uppercase tracking-wide text-ink-muted">
                          <th className="px-5 py-3 font-medium">Date</th>
                          <th className="px-3 py-3 font-medium">Description</th>
                          <th className="px-3 py-3 font-medium">Category</th>
                          <th className="px-3 py-3 font-medium">Amount</th>
                          <th className="px-3 py-3 font-medium">Payment Mode</th>
                          <th className="px-5 py-3 text-right font-medium">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line/60">
                        {items.map((row) => (
                          <tr key={row._id} className="hover:bg-paper-2/40">
                            <td className="whitespace-nowrap px-5 py-3.5 text-ink">
                              {formatExpenseDate(row.spentAt)}
                            </td>
                            <td className="max-w-[160px] truncate px-3 py-3.5 text-ink">
                              {row.note || row.category}
                            </td>
                            <td className="px-3 py-3.5">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                  categoryBadgeClass(row.category),
                                )}
                              >
                                {row.category}
                              </span>
                            </td>
                            <td className="px-3 py-3.5 font-semibold text-ink">
                              {formatINR(row.amount)}
                            </td>
                            <td className="px-3 py-3.5">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                                  paymentTone(row.paymentMethod),
                                )}
                              >
                                {paymentLabel(row.paymentMethod)}
                              </span>
                            </td>
                            <td className="relative px-5 py-3.5 text-right">
                              <div
                                ref={
                                  menuId === row._id ? menuRef : undefined
                                }
                                className="inline-block"
                              >
                                <button
                                  type="button"
                                  className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-paper-2 hover:text-ink"
                                  aria-label="Expense actions"
                                  onClick={() =>
                                    setMenuId((id) =>
                                      id === row._id ? null : row._id,
                                    )
                                  }
                                >
                                  <MoreHorizontal className="size-4" />
                                </button>
                                {menuId === row._id ? (
                                  <div className="absolute right-5 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-soft">
                                    <button
                                      type="button"
                                      className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft"
                                      onClick={() => deleteExpense(row._id)}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    className="mt-auto"
                    page={page}
                    pageSize={pageSize}
                    total={totalCount}
                    noun="expenses"
                    onPageChange={setPage}
                  />
                </>
              )}
            </Surface>
          </div>
        </>
      )}

      {editingBudget ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setEditingBudget(false)}
        >
          <form
            className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-5 shadow-soft"
            onClick={(ev) => ev.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              saveBudget();
            }}
          >
            <h2 className="text-lg font-semibold">Monthly budget</h2>
            <Input
              label="Budget (₹)"
              type="number"
              min="1"
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              autoFocus
              required
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setEditingBudget(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" fullWidth>
                Save
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          onClick={() => setOpen(false)}
        >
          <form
            className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-soft"
            onClick={(ev) => ev.stopPropagation()}
            onSubmit={onSubmit}
          >
            <h2 className="text-lg font-semibold">Naya kharcha</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Category</span>
              <select
                className="h-12 rounded-xl border border-line bg-white px-3.5"
                value={category}
                onChange={(e) =>
                  setCategory(
                    e.target.value as (typeof EXPENSE_CATEGORIES)[number],
                  )
                }
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Amount (₹)"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              autoFocus
            />
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Paid via</span>
              <select
                className="h-12 rounded-xl border border-line bg-white px-3.5"
                value={method}
                onChange={(e) =>
                  setMethod(e.target.value as "CASH" | "UPI" | "BANK")
                }
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="BANK">Bank Transfer</option>
              </select>
            </label>
            <Input
              label="Description / Note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Electricity Bill"
            />
            {formError ? (
              <p className="text-sm text-danger">{formError}</p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => setOpen(false)}
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
