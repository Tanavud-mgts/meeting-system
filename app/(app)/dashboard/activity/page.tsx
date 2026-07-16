"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHero } from "@/components/ui/PageHero";

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
      <PageHero
        title="ประวัติการทำงานรวม"
        subtitle="บันทึกการทำงานทั้งหมดในระบบ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto -mt-6 max-w-2xl px-6">

      <div className="mt-4">
        <select
          value={eventTypeFilter}
          onChange={(e) => handleFilterChange(e.target.value)}
          className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
        >
          <option value="">ทั้งหมด</option>
          <option value="approval">{EVENT_TYPE_LABEL.approval}</option>
          <option value="cancellation">{EVENT_TYPE_LABEL.cancellation}</option>
          <option value="config_change">
            {EVENT_TYPE_LABEL.config_change}
          </option>
        </select>
      </div>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}

      {!loading && entries.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่พบประวัติการทำงาน
        </p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {entries.map((e) => (
            <Card key={e.id}>
              <p className="font-medium text-text-primary">
                {getEventLabel(e.event_type, e.sub_type)}
              </p>
              <p className="text-sm text-text-secondary">
                โดย {e.actor_name}
                {e.related_ref && ` — ${e.related_ref}`}
              </p>
              {e.detail && (
                <p className="text-sm text-text-secondary">{e.detail}</p>
              )}
              <p className="mt-1 text-sm text-text-secondary">
                {new Date(e.occurred_at).toLocaleString("th-TH")}
              </p>
            </Card>
          ))}
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
