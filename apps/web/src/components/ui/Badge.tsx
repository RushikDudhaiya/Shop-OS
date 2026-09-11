import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "success" | "warn" | "danger" | "forest";

const toneClass: Record<Tone, string> = {
  neutral: "bg-paper-2 text-ink",
  success: "bg-success-soft text-success",
  warn: "bg-gold/25 text-ink",
  danger: "bg-danger-soft text-danger",
  forest: "bg-forest/10 text-forest",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  children: ReactNode;
}

export function Badge({ tone = "neutral", className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-semibold",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
