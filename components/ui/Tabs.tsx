"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string };

export function Tabs({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto border-b border-neutral-200 bg-surface-card px-4 md:px-6">
      <nav className="flex gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm transition-colors ${
                active
                  ? "border-brand-primary font-bold text-brand-primary"
                  : "border-transparent font-medium text-text-secondary hover:text-text-primary"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
