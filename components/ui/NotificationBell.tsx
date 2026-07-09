"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/hooks/useNotifications";
import { formatRelativeThai } from "@/lib/notifications/format";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { unreadCount, items, loading, markAsRead, markAllAsRead, remove } =
    useNotifications();

  async function onItemClick(id: string, link: string | null) {
    await markAsRead(id);
    setOpen(false);
    if (link) router.push(link);
  }

  return (
    <div className="fixed right-3 top-3 z-40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="การแจ้งเตือน"
        className="relative flex h-10 w-10 items-center justify-center rounded-sm border border-neutral-200 bg-surface-card"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5 text-text-primary"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-w-4 items-center justify-center rounded-pill bg-danger-surface px-1 text-xs font-semibold text-danger-text">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-80 max-w-[90vw] overflow-hidden rounded-lg border border-neutral-200 bg-surface-card shadow-raised">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
              <span className="text-sm font-semibold text-text-primary">
                การแจ้งเตือน
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-xs text-brand-primary hover:underline"
                >
                  อ่านทั้งหมด
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <p className="px-4 py-6 text-center text-sm text-text-muted">
                  กำลังโหลด...
                </p>
              ) : items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-text-muted">
                  ยังไม่มีการแจ้งเตือน
                </p>
              ) : (
                items.map((n) => (
                  <div
                    key={n.id}
                    className={`flex gap-2 border-b border-neutral-100 px-4 py-3 ${
                      n.is_read ? "" : "bg-nav-active-surface"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onItemClick(n.id, n.link)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-sm font-medium text-text-primary">
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="mt-0.5 text-sm text-text-secondary">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-text-muted">
                        {formatRelativeThai(n.created_at)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(n.id)}
                      aria-label="ลบการแจ้งเตือน"
                      className="h-6 w-6 shrink-0 text-text-muted hover:text-text-secondary"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
