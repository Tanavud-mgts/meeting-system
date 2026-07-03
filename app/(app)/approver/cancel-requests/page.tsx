"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
    <div className="mx-auto max-w-2xl p-6">
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

      <div className="mt-4 space-y-3">
        {requests.map((r) => (
          <div
            key={r.id}
            className="rounded-lg border border-neutral-200 bg-surface-card p-5"
          >
            <p className="font-medium text-text-primary">{r.title}</p>
            <p className="text-sm text-text-secondary">
              {r.ref_id} — ห้อง {r.room_name} — ผู้จอง {r.requester_name}
            </p>
            <p className="mt-2 text-sm text-text-primary">
              เหตุผล: {r.cancellation_reason ?? "-"}
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() =>
                  setConfirmTarget({ booking: r, decision: "approve" })
                }
                className="rounded-sm bg-success-solid px-4 py-2 text-sm font-medium text-text-on-primary"
              >
                อนุมัติการยกเลิก
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmTarget({ booking: r, decision: "reject" })
                }
                className="rounded-sm border border-danger-border bg-danger-surface px-4 py-2 text-sm font-medium text-danger-text"
              >
                ปฏิเสธคำขอ
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirmTarget && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl bg-surface-card p-6 shadow-modal">
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
              <button
                type="button"
                onClick={() => setConfirmTarget(null)}
                className="rounded-sm border border-neutral-300 px-4 py-2 text-sm text-text-secondary"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirm}
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
