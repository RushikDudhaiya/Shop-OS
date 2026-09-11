import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** e.g. "customers" → "Showing 1–10 of 50 customers" */
  noun?: string;
  className?: string;
}

function formatCount(n: number) {
  return n.toLocaleString("en-IN");
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  noun,
  className,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const showingTo = total > 0 ? Math.min(page * pageSize, total) : 0;
  const showNav = total > pageSize;

  if (total === 0) return null;

  const summary = noun
    ? `Showing ${formatCount(showingFrom)}–${formatCount(showingTo)} of ${formatCount(total)} ${noun}`
    : `Showing ${formatCount(showingFrom)}–${formatCount(showingTo)} of ${formatCount(total)}`;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line/70 bg-paper-2/40 px-5 py-3.5",
        className,
      )}
    >
      <p className="text-sm text-ink-muted">{summary}</p>
      {showNav ? (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-full bg-paper-2 text-ink disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-12 text-center text-sm text-ink-muted">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-full border border-ink bg-white text-ink disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            aria-label="Next page"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
