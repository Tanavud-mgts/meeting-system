import type { ReactNode } from "react";

type Tone = "success" | "warning" | "danger" | "neutral";

// Editorial status indicator for dense lists/tables: a small SQUARE swatch
// (not a pill) + label. The pill-shaped Badge stays for headings/dialogs.
const SWATCH_CLASS: Record<Tone, string> = {
  success: "bg-success-accent",
  warning: "bg-warning-accent",
  danger: "bg-danger-solid",
  neutral: "bg-neutral-400",
};

const TEXT_CLASS: Record<Tone, string> = {
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-danger-text",
  neutral: "text-text-secondary",
};

export function StatusMarker({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${TEXT_CLASS[tone]}`}>
      <span
        className={`inline-block h-[9px] w-[9px] flex-none ${SWATCH_CLASS[tone]}`}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}
