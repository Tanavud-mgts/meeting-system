import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  padding = "p-5",
}: {
  children: ReactNode;
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
