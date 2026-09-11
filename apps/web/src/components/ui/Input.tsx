import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export function Input({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label className="flex w-full flex-col gap-1.5">
      {label ? (
        <span className="text-sm font-medium text-ink">{label}</span>
      ) : null}
      <input
        id={inputId}
        className={cn(
          "h-12 w-full rounded-xl border bg-white px-3.5 text-base text-ink",
          "placeholder:text-ink-muted/70",
          "border-line hover:border-ink-muted/40 focus:border-forest",
          error && "border-danger",
          className,
        )}
        aria-invalid={Boolean(error)}
        {...props}
      />
      {error ? (
        <span className="text-sm text-danger">{error}</span>
      ) : hint ? (
        <span className="text-sm text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
}
