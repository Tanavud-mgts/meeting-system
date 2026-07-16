"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Badge } from "@/components/ui/Badge";
import { PageHero } from "@/components/ui/PageHero";

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

      if (!user) {
        setLoadError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
        setLoading(false);
        return;
      }

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
    <div className="animate-fade-in-up pb-10">
      <PageHero
        title="ประวัติการทำงาน"
        subtitle="รายการอนุมัติและปฏิเสธที่ผ่านมาของคุณ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto -mt-6 max-w-2xl space-y-4 px-6">

      {loadError && <p className="text-sm text-danger-text">{loadError}</p>}

      {!loading && entries.length === 0 && !loadError && (
        <div className="rounded-lg border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
          ยังไม่มีประวัติการทำงาน
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!loading && (
        <div className="space-y-3">
          {entries.map((e) => (
            <Card
              key={e.id}
              className={`border-l-4 ${
                e.action === "approved"
                  ? "border-l-success-solid"
                  : "border-l-danger-solid"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-text-primary">
                  {e.booking_title}{" "}
                  <span className="font-mono text-sm font-normal text-text-muted">
                    {e.booking_ref_id}
                  </span>
                </p>
                <Badge tone={e.action === "approved" ? "success" : "danger"}>
                  {e.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"}
                </Badge>
              </div>
              <p className="mt-1.5 text-sm text-text-secondary">
                ขั้นที่ {e.step} —{" "}
                {new Date(e.acted_at).toLocaleString("th-TH")}
              </p>
              {e.note && (
                <p className="mt-1 text-sm text-text-secondary">{e.note}</p>
              )}
            </Card>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
