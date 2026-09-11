import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
}

/** Soft surface for interactive groups — not decorative card clutter */
export function Surface({
  children,
  padded = true,
  className,
  ...props
}: SurfaceProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line/80 bg-white/90 shadow-soft",
        padded && "p-4 md:p-5",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
