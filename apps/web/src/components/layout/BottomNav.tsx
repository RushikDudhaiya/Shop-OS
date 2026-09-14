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

/** Mock footer — identical on every mobile screen */
const items: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/bill", label: "New Bill", icon: Receipt },
  { to: "/products", label: "Products", icon: Package },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/more", label: "More", icon: MoreHorizontal },
];

export function BottomNav({ className }: { className?: string }) {
  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 border-t border-[#e8ecf0] bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgb(20_32_27/0.04)] md:hidden",
        className,
      )}
      aria-label="Primary"
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={to === "/"}
              className="flex h-14 w-full flex-col items-center justify-center gap-0.5"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-[10px] transition-colors",
                      isActive
                        ? "bg-[#e7f3ec] text-[#0d3d2a]"
                        : "bg-transparent text-[#6b7280]",
                    )}
                  >
                    <Icon
                      className="size-5"
                      strokeWidth={isActive ? 2.25 : 1.85}
                    />
                  </span>
                  <span
                    className={cn(
                      "whitespace-nowrap text-center text-[10px] leading-none",
                      isActive
                        ? "font-semibold text-[#0d3d2a]"
                        : "font-medium text-[#6b7280]",
                    )}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
