import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Home,
  Package,
  Receipt,
  Users,
  BarChart3,
  Wallet,
  Settings,
  Boxes,
  Truck,
  Bot,
  ChevronDown,
  Percent,
  type LucideIcon,
} from "lucide-react";
import { APP_NAME } from "@shop-os/shared";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/lib/api";
import type { AutopilotDashboard } from "@/features/autopilot/types";
import { cn } from "@/lib/cn";

const primary: {
  to: string;
  label: string;
  icon: LucideIcon;
  tag?: string;
}[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/bill", label: "New Bill", icon: Receipt },
  { to: "/products", label: "Products", icon: Package },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/purchases", label: "Purchases", icon: Truck },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/profit", label: "Profit Margin", icon: Percent, tag: "NEW" },
  { to: "/expenses", label: "Kharcha", icon: Wallet },
];

function shopInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "SH";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}

function roleLabel(role?: string) {
  if (!role) return "Staff";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function SideLink({
  to,
  label,
  icon: Icon,
  badge,
  tag,
}: {
  to: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
  tag?: string;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-emerald-600 text-white shadow-soft"
            : "text-white/70 hover:bg-white/10 hover:text-white",
        )
      }
    >
      <Icon className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {tag ? (
        <span className="rounded-md bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-950">
          {tag}
        </span>
      ) : null}
      {badge !== undefined && badge > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-sky-400/90 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
    </NavLink>
  );
}

export function Sidebar({ className }: { className?: string }) {
  const { activeShop } = useAuth();
  const { pathname } = useLocation();
  const shopId = activeShop?._id;
  const name = activeShop?.name ?? "No shop selected";
  const initials = shopInitials(activeShop?.name ?? "Shop");
  const [autopilotCount, setAutopilotCount] = useState(0);

  useEffect(() => {
    if (!shopId) {
      setAutopilotCount(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api<AutopilotDashboard>(
          `/api/shops/${shopId}/autopilot`,
        );
        if (!cancelled) setAutopilotCount(data.alerts.length);
      } catch {
        if (!cancelled) setAutopilotCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopId, pathname]);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh w-[220px] min-w-[220px] max-w-[220px] shrink-0 flex-col overflow-y-auto border-r border-white/10 bg-[#0b2f24] md:flex xl:w-[250px] xl:min-w-[250px] xl:max-w-[250px]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={{
        backgroundImage:
          "radial-gradient(ellipse 120% 80% at 10% 100%, rgba(16,185,129,0.18), transparent 55%), linear-gradient(180deg, #0d3d2a 0%, #0b2f24 55%, #08241c 100%)",
      }}
    >
      <div className="border-b border-white/10 px-5 py-5">
        <p className="font-display text-2xl font-bold text-white">{APP_NAME}</p>
        <p className="mt-1 truncate text-xs text-white/55">{name}</p>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Desktop">
        {primary.map((item) => (
          <SideLink key={item.to} {...item} />
        ))}
        <SideLink
          to="/autopilot"
          label="Shop Autopilot"
          icon={Bot}
          badge={autopilotCount}
        />
        <div className="mt-auto pt-4">
          <SideLink to="/more" label="Settings" icon={Settings} />
        </div>
      </nav>

      <div className="border-t border-white/10 p-3">
        <NavLink
          to="/more"
          className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/10"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white">
            {initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-white">
              {name}
            </span>
            <span className="block text-xs text-emerald-300/90">
              {roleLabel(activeShop?.role)}
              <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-200/80">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                Online
              </span>
            </span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-white/50" />
        </NavLink>
      </div>
    </aside>
  );
}
