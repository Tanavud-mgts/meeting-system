import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  padding = "p-5",
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
}) {
  return (
    <div
      className={`rounded-lg border border-neutral-200 bg-surface-card ${padding} shadow-card transition-shadow duration-150 hover:shadow-raised ${className}`}
    >
      {children}
    </div>
  );
}
