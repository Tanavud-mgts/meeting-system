"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { FieldTable } from "@/components/ui/FieldTable";
import { StatusMarker } from "@/components/ui/StatusMarker";

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
      <PageHeader
        title="ประวัติการทำงาน"
        subtitle="รายการอนุมัติและปฏิเสธที่ผ่านมาของคุณ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl space-y-4 px-6">
        {loadError && <p className="text-sm text-danger-text">{loadError}</p>}

        {!loading && entries.length === 0 && !loadError && (
          <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
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
          <div className="space-y-4">
            {entries.map((e) => (
              <EditorialCard
                key={e.id}
                accent={e.action === "approved" ? "success" : "danger"}
              >
                <EditorialCard.Section>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-bold text-text-primary">
                        {e.booking_title}
                      </p>
                      <StatusMarker
                        tone={e.action === "approved" ? "success" : "danger"}
                      >
                        {e.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"}
                      </StatusMarker>
                    </div>
                    <span className="font-mono text-xs text-text-muted">
                      {e.booking_ref_id}
                    </span>
                  </div>
                </EditorialCard.Section>

                <EditorialCard.Section className={e.note ? "!py-0" : ""}>
                  <FieldTable
                    rows={[
                      { label: "ขั้นที่", value: e.step },
                      {
                        label: "เมื่อ",
                        value: new Date(e.acted_at).toLocaleString("th-TH"),
                        mono: true,
                      },
                    ]}
                  />
                </EditorialCard.Section>

                {e.note && (
                  <EditorialCard.Section>
                    <p className="mb-1 text-xs font-bold tracking-wider text-text-muted">
                      หมายเหตุ
                    </p>
                    <p className="text-sm text-text-primary">{e.note}</p>
                  </EditorialCard.Section>
                )}
              </EditorialCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
