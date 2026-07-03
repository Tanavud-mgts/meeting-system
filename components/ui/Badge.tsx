import type { ReactNode } from "react";

type BadgeTone = "success" | "warning" | "danger" | "neutral";

const TONE_CLASS: Record<BadgeTone, string> = {
  success: "bg-success-surface text-success-text",
  warning: "bg-warning-surface text-warning-text",
  danger: "bg-danger-surface text-danger-text",
  neutral: "bg-neutral-150 text-text-secondary",
};

export function Badge({
  tone,
  children,
}: {
  tone: BadgeTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-pill px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}
