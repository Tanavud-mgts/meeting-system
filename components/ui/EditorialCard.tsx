import type { ReactNode } from "react";

type Accent = "brand" | "warning" | "success" | "danger" | "none";

// Editorial card: structure comes from 1px rules, not shadow/roundness.
const ACCENT_CLASS: Record<Accent, string> = {
  brand: "border-l-[3px] border-l-brand-primary",
  warning: "border-l-[3px] border-l-warning-accent",
  success: "border-l-[3px] border-l-success-solid",
  danger: "border-l-[3px] border-l-danger-solid",
  none: "",
};

function EditorialCard({
  accent = "none",
  className = "",
  children,
}: {
  accent?: Accent;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`overflow-hidden rounded-[2px] border border-neutral-300 bg-surface-card ${ACCENT_CLASS[accent]} ${className}`}
    >
      {children}
    </div>
  );
}

function Section({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`border-b border-neutral-200 px-4 py-3 last:border-b-0 ${className}`}>
      {children}
    </div>
  );
}

EditorialCard.Section = Section;

export { EditorialCard };
