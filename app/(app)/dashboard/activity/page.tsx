"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { FieldTable, type FieldRow } from "@/components/ui/FieldTable";
import { StatusMarker } from "@/components/ui/StatusMarker";

type ActivityRow = {
  id: string;
  event_type: "approval" | "cancellation" | "config_change";
  sub_type: string;
  actor_name: string;
  related_ref: string | null;
  detail: string | null;
  occurred_at: string;
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  approval: "การอนุมัติ",
  cancellation: "การยกเลิก",
  config_change: "การตั้งค่า",
};

function getEventLabel(eventType: string, subType: string): string {
  if (eventType === "approval" && subType === "approved") {
    return "อนุมัติคำขอจอง";
  }
  if (eventType === "approval" && subType === "rejected") {
    return "ปฏิเสธคำขอจอง";
  }
  if (eventType === "cancellation" && subType === "user_cancel") {
    return "ผู้ใช้ยกเลิกการจอง";
  }
  if (eventType === "cancellation" && subType === "staff_cancel") {
    return "เจ้าหน้าที่ยกเลิกการจอง";
  }
  return subType;
}

function eventTone(
  eventType: string,
  subType: string
): "success" | "warning" | "danger" | "neutral" {
  if (eventType === "approval") {
    if (subType === "approved") return "success";
    if (subType === "rejected") return "danger";
    return "neutral";
  }
  if (eventType === "cancellation") return "warning";
  return "neutral";
}

const TONE_ACCENT: Record<
  "success" | "warning" | "danger" | "neutral",
  "success" | "warning" | "danger" | "none"
> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  neutral: "none",
};

const PAGE_SIZE = 20;

export default function DashboardActivityPage() {
  const [entries, setEntries] = useState<ActivityRow[]>([]);
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadActivity() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("staff_activity_timeline")
      .select(
        "id, event_type, sub_type, actor_name, related_ref, detail, occurred_at",
        { count: "exact" }
      )
      .order("occurred_at", { ascending: false })
      .range(from, to);

    if (eventTypeFilter) {
      query = query.eq("event_type", eventTypeFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      setLoadError("ไม่สามารถโหลดประวัติการทำงานได้");
      setLoading(false);
      return;
    }

    setEntries((data ?? []) as ActivityRow[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, eventTypeFilter]);

  function handleFilterChange(value: string) {
    setEventTypeFilter(value);
    setPage(0);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="ประวัติการทำงานรวม"
        subtitle="บันทึกการทำงานทั้งหมดในระบบ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl px-6">
        <select
          value={eventTypeFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
        >
          <option value="">ทั้งหมด</option>
          <option value="approval">{EVENT_TYPE_LABEL.approval}</option>
          <option value="cancellation">{EVENT_TYPE_LABEL.cancellation}</option>
          <option value="config_change">{EVENT_TYPE_LABEL.config_change}</option>
        </select>

        {loadError && (
          <p className="mt-4 text-sm text-danger-text">{loadError}</p>
        )}

        {!loading && entries.length === 0 && !loadError && (
          <div className="mt-4 rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
            ไม่พบประวัติการทำงาน
          </div>
        )}

        {loading && (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {!loading && (
          <div className="mt-4 space-y-4">
            {entries.map((e) => {
              const tone = eventTone(e.event_type, e.sub_type);
              const rows: FieldRow[] = [
                { label: "โดย", value: e.actor_name },
                ...(e.detail
                  ? [{ label: "รายละเอียด", value: e.detail }]
                  : []),
                {
                  label: "เมื่อ",
                  value: new Date(e.occurred_at).toLocaleString("th-TH"),
                  mono: true,
                },
              ];
              return (
                <EditorialCard key={e.id} accent={TONE_ACCENT[tone]}>
                  <EditorialCard.Section>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-md font-bold text-text-primary">
                          {getEventLabel(e.event_type, e.sub_type)}
                        </p>
                        <StatusMarker tone={tone}>
                          {EVENT_TYPE_LABEL[e.event_type] ?? e.event_type}
                        </StatusMarker>
                      </div>
                      {e.related_ref && (
                        <span className="font-mono text-xs text-text-muted">
                          {e.related_ref}
                        </span>
                      )}
                    </div>
                  </EditorialCard.Section>

                  <EditorialCard.Section className="!py-0">
                    <FieldTable rows={rows} />
                  </EditorialCard.Section>
                </EditorialCard>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            ก่อนหน้า
          </Button>
          <span className="text-sm text-text-secondary">
            หน้า {page + 1} / {totalPages}
          </span>
          <Button
            variant="secondary"
            onClick={() => setPage((p) => p + 1)}
            disabled={page + 1 >= totalPages}
          >
            ถัดไป
          </Button>
        </div>
      </div>
    </div>
  );
}
