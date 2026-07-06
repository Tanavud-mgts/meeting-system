"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { SidebarItem } from "@/lib/nav";

function isActive(item: SidebarItem, pathname: string): boolean {
  if (item.groupHrefs) return item.groupHrefs.includes(pathname);
  return pathname === item.href;
}

function linkClass(active: boolean): string {
  return `rounded-sm px-3 py-2 text-sm ${
    active
      ? "bg-neutral-100 font-medium text-text-primary"
      : "text-text-secondary hover:bg-neutral-100"
  }`;
}

export default function AppNav({ items }: { items: SidebarItem[] }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <>
      <aside className="hidden w-[200px] shrink-0 border-r border-neutral-200 bg-surface-card p-4 md:block">
        <nav className="flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(isActive(item, pathname))}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="เปิดเมนู"
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-sm border border-neutral-200 bg-surface-card md:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setDrawerOpen(false)}
          />
          <nav className="absolute inset-y-0 left-0 w-64 max-w-[80vw] overflow-y-auto bg-surface-card p-4">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-text-primary">เมนู</p>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="ปิดเมนู"
                className="flex h-8 w-8 items-center justify-center rounded-sm text-lg text-text-secondary"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-1">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className={linkClass(isActive(item, pathname))}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-neutral-200 bg-surface-card pb-[env(safe-area-inset-bottom)] md:hidden">
        {items.slice(0, 4).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`text-xs ${
              isActive(item, pathname)
                ? "font-medium text-text-primary"
                : "text-text-secondary"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
