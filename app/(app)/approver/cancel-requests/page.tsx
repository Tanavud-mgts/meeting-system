"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";

type CancelRequestRow = {
  id: string;
  ref_id: string;
  title: string;
  room_name: string;
  requester_name: string;
  cancellation_reason: string | null;
  created_at: string;
};

export default function CancelRequestsPage() {
  const [requests, setRequests] = useState<CancelRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    booking: CancelRequestRow;
    decision: "approve" | "reject";
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadRequests() {
    setLoading(true);
    setLoadError(null);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("booking_detail")
      .select(
        "id, ref_id, title, room_name, requester_name, cancellation_reason, created_at, final_status"
      )
      .eq("final_status", "cancel_requested")
      .order("created_at", { ascending: true });

    if (error) {
      setLoadError("ไม่สามารถโหลดรายการคำขอยกเลิกได้");
      setLoading(false);
      return;
    }

    setRequests((data ?? []) as CancelRequestRow[]);
    setLoading(false);
  }

  useEffect(() => {
    loadRequests();
  }, []);

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
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/decide-cancellation`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_id: confirmTarget.booking.id,
          decision: confirmTarget.decision,
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

    await loadRequests();
  }

  return (
    <div className="mx-auto max-w-2xl animate-fade-in-up p-6">
      <h1 className="text-2xl font-semibold text-text-primary">
        คำขอยกเลิกการจอง
      </h1>

      {loadError && (
        <p className="mt-4 text-sm text-danger-text">{loadError}</p>
      )}
      {actionError && (
        <p className="mt-4 text-sm text-danger-text">{actionError}</p>
      )}

      {!loading && requests.length === 0 && !loadError && (
        <p className="mt-4 text-sm text-text-secondary">
          ไม่มีคำขอยกเลิกในขณะนี้
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
          {requests.map((r) => (
            <Card key={r.id}>
              <p className="font-medium text-text-primary">{r.title}</p>
              <p className="text-sm text-text-secondary">
                {r.ref_id} — ห้อง {r.room_name} — ผู้จอง {r.requester_name}
              </p>
              <p className="mt-2 text-sm text-text-primary">
                เหตุผล: {r.cancellation_reason ?? "-"}
              </p>
              <div className="mt-3 flex gap-3">
                <Button
                  variant="primary"
                  className="bg-success-solid hover:bg-success-solid"
                  onClick={() =>
                    setConfirmTarget({ booking: r, decision: "approve" })
                  }
                >
                  อนุมัติการยกเลิก
                </Button>
                <Button
                  variant="danger"
                  onClick={() =>
                    setConfirmTarget({ booking: r, decision: "reject" })
                  }
                >
                  ปฏิเสธคำขอ
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)}>
        {confirmTarget && (
          <>
            <p className="text-lg font-semibold text-text-primary">
              ยืนยันการ
              {confirmTarget.decision === "approve"
                ? "อนุมัติการยกเลิก"
                : "ปฏิเสธคำขอ"}
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
