"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type BookingRow = {
  id: string;
  ref_id: string;
  title: string;
  final_status: string;
  room_id: string;
  room_name: string;
  requester_name: string;
  created_at: string;
};

type Room = {
  id: string;
  name: string;
};

const STATUS_LABEL: Record<string, string> = {
  pending: "รออนุมัติ",
  approved: "อนุมัติแล้ว",
  cancel_requested: "รอ Admin พิจารณาคำขอยกเลิก",
  rejected: "ถูกปฏิเสธ",
  cancelled: "ยกเลิกแล้ว",
  cancelled_by_admin: "ยกเลิกแล้ว",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending: "bg-warning-surface text-warning-text",
  approved: "bg-success-surface text-success-text",
  cancel_requested: "bg-warning-surface text-warning-text",
  rejected: "bg-danger-surface text-danger-text",
  cancelled: "bg-neutral-150 text-text-secondary",
  cancelled_by_admin: "bg-neutral-150 text-text-secondary",
};

const TERMINAL_STATUSES = ["cancelled", "cancelled_by_admin", "rejected"];
const PAGE_SIZE = 20;

export default function DashboardBookingsPage() {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomFilter, setRoomFilter] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingRow | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function loadRooms() {
      const supabase = createClient();
      const { data } = await supabase
        .from("rooms")
        .select("id, name")
        .order("name", { ascending: true });
      setRooms((data ?? []) as Room[]);
    }
    loadRooms();
  }, []);

  async function loadBookings() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("booking_detail")
      .select(
        "id, ref_id, title, final_status, room_id, room_name, requester_name, created_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (roomFilter) {
      query = query.eq("room_id", roomFilter);
    }

    const { data, error, count } = await query;

    if (error) {
      setLoadError("ไม่สามารถโหลดรายการจองได้");
      setLoading(false);
      return;
    }

    setBookings((data ?? []) as BookingRow[]);
    setTotalCount(count ?? 0);
    setLoading(false);
  }

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, roomFilter]);

  function handleRoomFilterChange(value: string) {
    setRoomFilter(value);
    setPage(0);
  }

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

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/direct-cancel-booking`,
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

      if (!res.ok) {
        setActionError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
        return;
      }

      setCancelTarget(null);
      await loadBookings();
    } catch {
      setActionError("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        การจองทั้งหมด
      </h1>

      <div className="mt-4">
        <select
          value={roomFilter}
          onChange={(e) => handleRoomFilterChange(e.target.value)}
          className="rounded-sm border border-neutral-300 bg-surface-field px-3 py-2 text-sm text-text-primary"
        >
          <option value="">ทุกห้อง</option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && bookings.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">ไม่พบรายการจอง</p>
      )}

      <div className="mt-4 space-y-3">
        {bookings.map((b) => (
          <div
            key={b.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{b.title}</p>
            <p className="text-sm text-text-secondary">
              {b.ref_id} — ห้อง {b.room_name} — ผู้จอง {b.requester_name}
            </p>
            <span
              className={`mt-1 inline-block rounded-pill px-2.5 py-0.5 text-xs font-semibold ${
                STATUS_BADGE_CLASS[b.final_status] ??
                "bg-neutral-150 text-text-secondary"
              }`}
            >
              {STATUS_LABEL[b.final_status] ?? b.final_status}
            </span>
            {!TERMINAL_STATUSES.includes(b.final_status) && (
              <button
                type="button"
                onClick={() => openCancelDialog(b)}
                className="mt-3 rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ยกเลิกโดย Admin
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={page === 0}
          className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
        >
          ก่อนหน้า
        </button>
        <span className="text-sm text-text-secondary">
          หน้า {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => p + 1)}
          disabled={page + 1 >= totalPages}
          className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary disabled:opacity-50"
        >
          ถัดไป
        </button>
      </div>

      {cancelTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการยกเลิกโดย Admin
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
                className="rounded-sm bg-danger-solid px-4 py-2 text-sm font-medium text-text-on-primary disabled:opacity-50"
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
