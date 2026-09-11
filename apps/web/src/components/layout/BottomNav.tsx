import { NavLink } from "react-router-dom";
import {
  Home,
  Package,
  Receipt,
  Users,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

const items: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/bill", label: "New Bill", icon: Receipt },
  { to: "/products", label: "Products", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/more", label: "More", icon: MoreHorizontal },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-2 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgb(20_32_27/0.06)] md:hidden"
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-1 py-1.5">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-[11px] font-medium",
                  isActive ? "text-forest" : "text-ink-muted",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-xl",
                      isActive && "bg-forest/10",
                    )}
                  >
                    <Icon className="size-5" strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
