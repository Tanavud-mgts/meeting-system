"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHero } from "@/components/ui/PageHero";

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
      <PageHero
        title="ประวัติการจองของฉัน"
        subtitle="รายการจองทั้งหมดของคุณ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto -mt-6 max-w-2xl px-6">

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && bookings.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ยังไม่มีประวัติการจอง
        </p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && (
        <div className="mt-4 space-y-3">
          {bookings.map((b) => (
            <Card key={b.id}>
              <p className="font-medium text-text-primary">{b.title}</p>
              <p className="text-sm text-text-secondary">
                {b.ref_id} — ห้อง {b.room_name}
              </p>
              <div className="mt-1">
                <Badge tone={STATUS_TONE[b.final_status] ?? "neutral"}>
                  {STATUS_LABEL[b.final_status] ?? b.final_status}
                </Badge>
              </div>
              {b.final_status === "pending" && (
                <Button
                  variant="danger"
                  onClick={() => openCancelDialog(b)}
                  className="mt-3"
                >
                  ยกเลิกการจอง
                </Button>
              )}
              {b.final_status === "approved" && (
                <Button
                  variant="danger"
                  onClick={() => openCancelDialog(b)}
                  className="mt-3"
                >
                  ขอยกเลิกการจอง
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)}>
        {cancelTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              {cancelTarget.final_status === "pending"
                ? "ยืนยันการยกเลิกการจอง"
                : "ยืนยันการส่งคำขอยกเลิก"}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {cancelTarget.title} ({cancelTarget.ref_id})
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
