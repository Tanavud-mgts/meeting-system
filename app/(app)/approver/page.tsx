"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";

type PendingBooking = {
  id: string;
  ref_id: string;
  title: string;
  activity: string;
  attendees: number;
  start_time: string;
  end_time: string;
  created_at: string;
  room_name: string;
  requester_name: string;
};

export default function ApproverPage() {
  const [myStep, setMyStep] = useState<number | null>(null);
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    booking: PendingBooking;
    action: "approved" | "rejected";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadQueue() {
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

    const { data: config, error: configError } = await supabase
      .from("system_config")
      .select("admin_id, approver1_id, approver2_id")
      .single();

    if (configError || !config) {
      setLoadError("ไม่สามารถโหลดข้อมูล Approval Chain ได้");
      setLoading(false);
      return;
    }

    let step: number | null = null;
    if (config.admin_id === user.id) step = 1;
    else if (config.approver1_id === user.id) step = 2;
    else if (config.approver2_id === user.id) step = 3;

    setMyStep(step);

    if (step === null) {
      setBookings([]);
      setLoading(false);
      return;
    }

    const { data, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        "id, ref_id, title, activity, attendees, start_time, end_time, created_at, rooms(name), users(full_name)"
      )
      .eq("final_status", "pending")
      .eq("current_step", step - 1)
      .order("created_at", { ascending: true });

    if (bookingsError) {
      setLoadError("ไม่สามารถโหลดรายการคำขอได้");
      setLoading(false);
      return;
    }

    type Row = {
      id: string;
      ref_id: string;
      title: string;
      activity: string;
      attendees: number;
      start_time: string;
      end_time: string;
      created_at: string;
      rooms: { name: string } | null;
      users: { full_name: string } | null;
    };

    setBookings(
      ((data ?? []) as unknown as Row[]).map((b) => ({
        id: b.id,
        ref_id: b.ref_id,
        title: b.title,
        activity: b.activity,
        attendees: b.attendees,
        start_time: b.start_time,
        end_time: b.end_time,
        created_at: b.created_at,
        room_name: b.rooms?.name ?? "",
        requester_name: b.users?.full_name ?? "",
      }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadQueue();
  }, []);

  function waitingMinutes(createdAt: string): number {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  }

  async function handleConfirm() {
    if (!confirmTarget) return;

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
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/approve-booking`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id: confirmTarget.booking.id,
          action: confirmTarget.action,
        }),
      }
    );

    const result = await res.json();

    setSubmitting(false);
    setConfirmTarget(null);

    if (!res.ok) {
      setActionError(result.message ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
      return;
    }

    await loadQueue();
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        คำขออนุมัติ
      </h1>

      {loadError && <p className="mt-4 text-sm text-danger-text">{loadError}</p>}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {loading && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {!loading && myStep === null && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ท่านไม่ได้อยู่ใน Approval Chain
        </p>
      )}

      {!loading && myStep !== null && bookings.length === 0 && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่มีคำขอรออนุมัติในขณะนี้
        </p>
      )}

      <div className="mt-4 space-y-3">
        {!loading &&
          bookings.map((b) => {
            const urgent = waitingMinutes(b.created_at) > 120;
            return (
              <Card
                key={b.id}
                className={urgent ? "border-warning-border border-[1.5px]" : ""}
              >
                <p className="font-medium text-text-primary">{b.title}</p>
                <p className="text-sm text-text-secondary">
                  {b.ref_id} — ห้อง {b.room_name} — ผู้จอง {b.requester_name}
                </p>
                <p className="text-sm text-text-secondary">
                  ผู้เข้าร่วม {b.attendees} คน
                </p>
                <div className="mt-3 flex gap-3">
                  <Button
                    variant="primary"
                    className="bg-success-solid hover:bg-success-solid"
                    onClick={() =>
                      setConfirmTarget({ booking: b, action: "approved" })
                    }
                  >
                    อนุมัติ
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() =>
                      setConfirmTarget({ booking: b, action: "rejected" })
                    }
                  >
                    ปฏิเสธ
                  </Button>
                </div>
              </Card>
            );
          })}
      </div>

      <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)}>
        {confirmTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการ{confirmTarget.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"}
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              {confirmTarget.booking.title} ({confirmTarget.booking.ref_id})
            </p>
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" onClick={() => setConfirmTarget(null)}>
                ยกเลิก
              </Button>
              <Button onClick={handleConfirm} disabled={submitting}>
                {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
