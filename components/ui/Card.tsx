import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
  padding = "p-5",
}: {
  children: ReactNode;
  className?: string;
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
