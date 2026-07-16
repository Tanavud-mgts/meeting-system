import type { ReactNode } from "react";

/** สีแถบ accent ขอบบนการ์ด (5px) ตามแบบ Claude Design */
export type CardAccent = "brand" | "warning" | "success" | "danger" | "none";

const ACCENT_CLASS: Record<CardAccent, string> = {
  brand: "border-t-[5px] border-t-brand-primary",
  warning: "border-t-[5px] border-t-warning-accent",
  success: "border-t-[5px] border-t-success-solid",
  danger: "border-t-[5px] border-t-danger-solid",
  none: "",
};

export function Card({
  children,
  className = "",
  padding = "p-5",
  accent = "none",
}: {
  children: ReactNode;
  // Same caveat as padding: a border-color/width utility here (e.g. for a
  // conditional "urgent" state) only overrides this component's own
  // border-neutral-200 because it currently sorts after it alphabetically
  // in Tailwind's generated stylesheet — not guaranteed by this API.
  className?: string;
  // Use this to override spacing, not className — Tailwind resolves
  // conflicting utilities by stylesheet order, not string position, so a
  // padding class inside className can silently lose to this prop's p-5.
  padding?: string;
  accent?: CardAccent;
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-surface-card ${ACCENT_CLASS[accent]} ${padding} shadow-card transition-shadow duration-150 hover:shadow-raised ${className}`}
    >
      {children}
    </div>
  );
}
