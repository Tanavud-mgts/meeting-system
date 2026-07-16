"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { FieldTable } from "@/components/ui/FieldTable";
import { StatusMarker } from "@/components/ui/StatusMarker";

type BookingRow = {
  id: string;
  ref_id: string;
  title: string;
  final_status: string;
  start_time: string;
  end_time: string;
  room_name: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  cancel_requested: "รอ Admin พิจารณาคำขอยกเลิก",
  rejected: "ถูกปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
  cancelled_by_admin: "ยกเลิกแล้ว",
};

const STATUS_TONE: Record<
  string,
  "success" | "warning" | "danger" | "neutral"
> = {
  pending: "warning",
  approved: "success",
  cancel_requested: "warning",
  rejected: "danger",
  cancelled: "neutral",
  cancelled_by_admin: "neutral",
};

const STATUS_ACCENT: Record<
  string,
  "warning" | "success" | "danger" | "none"
> = {
  pending: "warning",
  approved: "success",
  cancel_requested: "warning",
  rejected: "danger",
  cancelled: "none",
  cancelled_by_admin: "none",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProfileBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadBookings() {
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
      .from("booking_detail")
      .select(
        "id, ref_id, title, final_status, start_time, end_time, room_name, created_at"
      )
      .eq("requester_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      setLoadError("ไม่สามารถโหลดรายการจองได้");
      setLoading(false);
      return;
    }

    setBookings((data ?? []) as BookingRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadBookings();
  }, []);

  function openCancelDialog(booking: BookingRow) {
    setCancelTarget(booking);
    setReason("");
    setReasonError(null);
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;

    if (reason.trim().length === 0) {
      setReasonError("กรุณากรอกเหตุผลการยกเลิก");
      return;
    }

    setSubmitting(true);
    setActionError(null);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setActionError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      setSubmitting(false);
      return;
    }

    const res = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/request-cancellation`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id: cancelTarget.id,
          reason: reason.trim(),
        }),
      }
    );

    const result = await res.json();

    setSubmitting(false);
    setCancelTarget(null);

    if (!res.ok) {
      setActionError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadBookings();
  }

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="ประวัติการจองของฉัน"
        subtitle="รายการจองทั้งหมดของคุณ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl px-6">
        {loadError && <p className="text-sm text-danger-text">{loadError}</p>}
        {actionError && (
          <p className="text-sm text-danger-text">{actionError}</p>
        )}

        {!loading && bookings.length === 0 && !loadError && (
          <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
            ยังไม่มีประวัติการจอง
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            {bookings.map((b) => {
              const cancellable =
                b.final_status === "pending" || b.final_status === "approved";
              return (
                <EditorialCard
                  key={b.id}
                  accent={STATUS_ACCENT[b.final_status] ?? "none"}
                >
                  <EditorialCard.Section>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-bold text-text-primary">
                          {b.title}
                        </p>
                        <StatusMarker
                          tone={STATUS_TONE[b.final_status] ?? "neutral"}
                        >
                          {STATUS_LABEL[b.final_status] ?? b.final_status}
                        </StatusMarker>
                      </div>
                      <span className="font-mono text-xs text-text-muted">
                        {b.ref_id}
                      </span>
                    </div>
                  </EditorialCard.Section>

                  <EditorialCard.Section className="!py-0">
                    <FieldTable
                      rows={[
                        { label: "ห้อง", value: b.room_name },
                        { label: "วันที่", value: fmtDate(b.start_time) },
                        {
                          label: "เวลา",
                          value: `${fmtTime(b.start_time)}–${fmtTime(b.end_time)} น.`,
                          mono: true,
                        },
                      ]}
                    />
                  </EditorialCard.Section>

                  {cancellable && (
                    <EditorialCard.Section>
                      <Button
                        variant="danger"
                        onClick={() => openCancelDialog(b)}
                      >
                        {b.final_status === "pending"
                          ? "ยกเลิกการจอง"
                          : "ขอยกเลิกการจอง"}
                      </Button>
                    </EditorialCard.Section>
                  )}
                </EditorialCard>
              );
            })}
          </div>
        )}

        <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)}>
          {cancelTarget && (
            <>
              <p className="text-lg font-extrabold text-text-primary">
                {cancelTarget.final_status === "pending"
                  ? "ยืนยันการยกเลิกการจอง"
                  : "ยืนยันการส่งคำขอยกเลิก"}
              </p>
              <p className="mt-2 text-sm text-text-secondary">
                {cancelTarget.title}{" "}
                <span className="font-mono text-text-muted">
                  ({cancelTarget.ref_id})
                </span>
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="กรุณาระบุเหตุผลการยกเลิก"
                rows={3}
                className="mt-3 w-full rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-base text-text-primary"
              />
              {reasonError && (
                <p className="mt-1 text-sm text-danger-text">{reasonError}</p>
              )}
              <div className="mt-4 flex gap-3">
                <Button variant="secondary" onClick={() => setCancelTarget(null)}>
                  ปิด
                </Button>
                <Button onClick={handleConfirmCancel} disabled={submitting}>
                  {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
                </Button>
              </div>
            </>
          )}
        </Modal>
      </div>
    </div>
  );
}
