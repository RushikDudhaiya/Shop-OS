import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Bell } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/cn";

function profileInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SO";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

export type AppPageHeaderProps = {
  title: string;
  subtitle?: string;
  /** Desktop-only actions (buttons, date chip, etc.) */
  action?: ReactNode;
  /** Hide mobile back button (rare) */
  hideBack?: boolean;
  className?: string;
};

/**
 * Shared page header for all screens except Home.
 * Mobile: back · centered title · bell + avatar · subtitle · optional action
 * Desktop: title + subtitle (+ optional action)
 */
export function AppPageHeader({
  title,
  subtitle,
  action,
  hideBack = false,
  className,
}: AppPageHeaderProps) {
  const navigate = useNavigate();
  const { user, activeShop } = useAuth();
  const avatar = profileInitials(user?.name || activeShop?.name || "SO");

  return (
    <header className={cn("w-full", className)}>
      {/* Mobile — mock layout */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3">
          {hideBack ? (
            <span className="size-10 shrink-0" aria-hidden />
          ) : (
            <button
              type="button"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-ink shadow-soft"
              onClick={() => navigate(-1)}
              aria-label="Back"
            >
              <ArrowLeft className="size-4" />
            </button>
          )}
          <h1 className="min-w-0 flex-1 truncate text-center text-lg font-bold text-ink">
            {title}
          </h1>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/more"
              className="relative inline-flex size-10 items-center justify-center rounded-full border border-line bg-white text-ink-muted shadow-soft"
              aria-label="Notifications"
            >
              <Bell className="size-4" />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-danger" />
            </Link>
            <Link
              to="/more"
              className="inline-flex size-10 items-center justify-center rounded-full bg-[#1a1c2e] text-xs font-bold text-white"
              aria-label="Profile"
            >
              {avatar}
            </Link>
          </div>
        </div>
        {subtitle ? (
          <p className="mt-3 text-sm text-ink-muted">{subtitle}</p>
        ) : null}
        {action ? <div className="mt-3 w-full">{action}</div> : null}
      </div>

      {/* Desktop */}
      <div
        className={cn(
          "hidden md:flex md:flex-col md:gap-3",
          action ? "lg:flex-row lg:items-start lg:justify-between" : null,
        )}
      >
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
          ) : null}
        </div>
        {action ? (
          <div className="w-full shrink-0 lg:w-auto [&_a]:w-full lg:[&_a]:w-auto [&_button]:w-full lg:[&_button]:w-auto">
            {action}
          </div>
        ) : null}
      </div>
    </header>
  );
}
