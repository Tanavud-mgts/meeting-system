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
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="การจองทั้งหมด"
        subtitle="รายการจองทุกสถานะในระบบ"
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl px-6">
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

        {loadError && (
          <p className="mt-4 text-sm text-danger-text">{loadError}</p>
        )}
        {actionError && (
          <p className="mt-4 text-sm text-danger-text">{actionError}</p>
        )}

        {!loading && bookings.length === 0 && !loadError && (
          <div className="mt-4 rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
            ไม่พบรายการจอง
          </div>
        )}

        {loading && (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!loading && (
          <div className="mt-4 space-y-4">
            {bookings.map((b) => (
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
                      { label: "ผู้จอง", value: b.requester_name },
                    ]}
                  />
                </EditorialCard.Section>

                {!TERMINAL_STATUSES.includes(b.final_status) && (
                  <EditorialCard.Section>
                    <Button
                      variant="danger"
                      onClick={() => openCancelDialog(b)}
                    >
                      ยกเลิกโดย Admin
                    </Button>
                  </EditorialCard.Section>
                )}
              </EditorialCard>
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

        <Modal open={cancelTarget !== null} onClose={() => setCancelTarget(null)}>
          {cancelTarget && (
            <>
              <p className="text-lg font-extrabold text-text-primary">
                ยืนยันการยกเลิกโดย Admin
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
                <Button
                  variant="primary"
                  className="bg-danger-solid hover:bg-danger-solid"
                  onClick={handleConfirmCancel}
                  disabled={submitting}
                >
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
