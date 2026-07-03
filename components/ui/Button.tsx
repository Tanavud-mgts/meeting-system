import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-primary text-text-on-primary hover:bg-brand-primary-strong",
  secondary:
    "border border-neutral-300 text-text-secondary hover:bg-neutral-100",
  danger:
    "border border-danger-border bg-danger-surface text-danger-text hover:bg-danger-solid hover:text-text-on-primary",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rounded-sm px-4 py-2 text-sm font-medium transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
