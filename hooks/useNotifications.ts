"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/notifications/format";

const LIST_LIMIT = 50;
const POLL_MS = 60_000;

export function useNotifications() {
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const userIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    userIdRef.current = user.id;
    const { data } = await supabase
      .from("notifications")
      .select("id, event_key, title, body, link, is_read, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);
    setItems((data ?? []) as NotificationRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    const supabase = createClient();
    load();

    // Realtime เป็นหลัก
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase
        .channel("user-notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => load()
        )
        .subscribe();
    })();

    // Polling backup 60 วินาที
    const timer = setInterval(load, POLL_MS);

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [load]);

  const markAsRead = useCallback(async (id: string) => {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", id);
  }, []);

  const markAllAsRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    const supabase = createClient();
    if (!userIdRef.current) return;
    await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("user_id", userIdRef.current)
      .eq("is_read", false);
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
  }, []);

  const unreadCount = items.filter((n) => !n.is_read).length;

  return { unreadCount, items, loading, markAsRead, markAllAsRead, remove };
}
