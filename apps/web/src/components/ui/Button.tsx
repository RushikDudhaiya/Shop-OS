import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type Size = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClass: Record<Variant, string> = {
  primary:
    "bg-forest text-white hover:bg-forest-2 active:bg-forest shadow-soft disabled:bg-forest/50",
  secondary:
    "bg-white text-ink border border-line hover:bg-paper-2 active:bg-paper-2",
  ghost: "bg-transparent text-ink hover:bg-paper-2 active:bg-paper-2",
  danger:
    "bg-danger text-white hover:bg-danger/90 active:bg-danger/80 disabled:bg-danger/50",
  gold: "bg-gold text-ink hover:bg-gold-2 active:bg-gold-2 shadow-soft font-semibold",
};

const sizeClass: Record<Size, string> = {
  sm: "h-10 px-3 text-sm gap-1.5 rounded-xl",
  md: "h-12 px-4 text-base gap-2 rounded-xl",
  lg: "h-14 px-5 text-base gap-2 rounded-2xl",
  xl: "h-16 px-6 text-lg gap-2.5 rounded-2xl font-semibold",
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  loading,
  leftIcon,
  rightIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center select-none transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variantClass[variant],
        sizeClass[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    >
      {loading ? (
        <span
          className="size-5 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!loading && rightIcon}
    </button>
  );
}
