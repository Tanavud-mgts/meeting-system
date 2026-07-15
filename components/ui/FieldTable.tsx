import type { ReactNode } from "react";

export type FieldRow = {
  label: string;
  value: ReactNode;
  mono?: boolean;
};

// Aligned label/value rows for booking metadata. Replaces scattered
// `grid gap-x-4 gap-y-1.5` blocks with one hairline-ruled column grid.
export function FieldTable({ rows }: { rows: FieldRow[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] text-sm">
      {rows.map((row, i) => {
        const last = i === rows.length - 1;
        const divider = last ? "" : "border-b border-neutral-150";
        return (
          <div key={`${row.label}-${i}`} className="contents">
            <dt
              className={`py-2 pr-4 text-text-muted ${divider}`}
            >
              {row.label}
            </dt>
            <dd
              className={`py-2 text-text-primary ${row.mono ? "font-mono" : ""} ${divider}`}
            >
              {row.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
