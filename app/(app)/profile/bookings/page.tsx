"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        ประวัติการจองของฉัน
      </h1>

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

      <div className="mt-4 space-y-3">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{b.title}</p>
            <p className="text-sm text-text-secondary">
              {b.ref_id} — ห้อง {b.room_name}
            </p>
            <p className="text-sm text-text-secondary">
              สถานะ: {STATUS_LABEL[b.final_status] ?? b.final_status}
            </p>
            {b.final_status === "pending" && (
              <button
                type="button"
                onClick={() => openCancelDialog(b)}
                className="mt-3 rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ยกเลิกการจอง
              </button>
            )}
            {b.final_status === "approved" && (
              <button
                type="button"
                onClick={() => openCancelDialog(b)}
                className="mt-3 rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ขอยกเลิกการจอง
              </button>
            )}
          </div>
        ))}
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
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
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={submitting}
                className="rounded-sm bg-brand-primary px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
              >
                {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
