"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type HistoryEntry = {
  id: string;
  step: number;
  action: "approved" | "rejected";
  note: string | null;
  acted_at: string;
  booking_ref_id: string;
  booking_title: string;
};

export default function ApproverHistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setLoadError(null);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { data, error } = await supabase
        .from("approval_logs")
        .select("id, step, action, note, acted_at, bookings(ref_id, title)")
        .eq("approver_id", user.id)
        .order("acted_at", { ascending: false });

      if (error) {
        setLoadError("ไม่สามารถโหลดประวัติการทำงานได้");
        setLoading(false);
        return;
      }

      type Row = {
        id: string;
        step: number;
        action: "approved" | "rejected";
        note: string | null;
        acted_at: string;
        bookings: { ref_id: string; title: string } | null;
      };

      setEntries(
        ((data ?? []) as unknown as Row[]).map((r) => ({
          id: r.id,
          step: r.step,
          action: r.action,
          note: r.note,
          acted_at: r.acted_at,
          booking_ref_id: r.bookings?.ref_id ?? "",
          booking_title: r.bookings?.title ?? "",
        }))
      );
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการทำงาน
      </h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}

      {!loading && entries.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ยังไม่มีประวัติการทำงาน
        </p>
      )}

      <div className="mt-4 space-y-3">
        {entries.map((e) => (
          <div
            key={e.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">
              {e.booking_title} ({e.booking_ref_id})
            </p>
            <p className="text-sm text-text-secondary">
              ขั้นที่ {e.step} —{" "}
              {e.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"} —{" "}
              {new Date(e.acted_at).toLocaleString("th-TH")}
            </p>
            {e.note && (
              <p className="mt-1 text-sm text-text-secondary">{e.note}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
