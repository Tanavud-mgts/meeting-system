import type { ReactNode } from "react";

// Editorial page header: short, flat, hairline-ruled. Gradient survives only
// as the vertical accent bar (.section-bar). Unlike PageHero, content below is
// NOT overlapped (no -mt-6) — the grid starts cleanly under the rule.
export function PageHeader({
  title,
  subtitle,
  width = "max-w-2xl",
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  width?: string;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-neutral-300 bg-surface-card px-6 pb-5 pt-6">
      <div className={`mx-auto ${width}`}>
        <h1 className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-text-primary">
          <span className="section-bar h-8" aria-hidden="true" />
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 pl-5 text-md text-text-secondary">
            {subtitle}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
