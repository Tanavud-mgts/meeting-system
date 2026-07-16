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
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="คำขอยกเลิกการจอง"
        subtitle="พิจารณาคำขอยกเลิกการจองที่อนุมัติแล้ว"
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl space-y-4 px-6">
        {loadError && <p className="text-sm text-danger-text">{loadError}</p>}
        {actionError && (
          <p className="text-sm text-danger-text">{actionError}</p>
        )}

        {!loading && requests.length === 0 && !loadError && (
          <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
            ไม่มีคำขอยกเลิกในขณะนี้
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
            {requests.map((r) => (
              <EditorialCard key={r.id} accent="danger">
                <EditorialCard.Section>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-bold text-text-primary">
                        {r.title}
                      </p>
                      <StatusMarker tone="warning">
                        รอพิจารณายกเลิก
                      </StatusMarker>
                    </div>
                    <span className="font-mono text-xs text-text-muted">
                      {r.ref_id}
                    </span>
                  </div>
                </EditorialCard.Section>

                <EditorialCard.Section className="!py-0">
                  <FieldTable
                    rows={[
                      { label: "ห้อง", value: r.room_name },
                      { label: "ผู้จอง", value: r.requester_name },
                    ]}
                  />
                </EditorialCard.Section>

                <EditorialCard.Section>
                  <p className="mb-1 text-xs font-bold tracking-wider text-text-muted">
                    เหตุผลการยกเลิก
                  </p>
                  <p className="text-sm text-text-primary">
                    {r.cancellation_reason ?? "-"}
                  </p>
                </EditorialCard.Section>

                <div className="flex border-t border-neutral-300">
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmTarget({ booking: r, decision: "reject" })
                    }
                    className="flex-1 cursor-pointer border-r border-neutral-200 py-3 text-sm font-bold text-warning-text transition-colors hover:bg-warning-surface"
                  >
                    ปฏิเสธคำขอ
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmTarget({ booking: r, decision: "approve" })
                    }
                    className="bg-grad-success flex-1 cursor-pointer py-3 text-sm font-bold text-text-on-primary transition-transform hover:scale-[1.01]"
                  >
                    อนุมัติการยกเลิก
                  </button>
                </div>
              </EditorialCard>
            ))}
          </div>
        )}

        <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)}>
          {confirmTarget && (
            <div className="text-center">
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold text-text-on-primary ${
                  confirmTarget.decision === "approve"
                    ? "bg-grad-success shadow-success"
                    : "bg-grad-danger"
                }`}
              >
                {confirmTarget.decision === "approve" ? "✓" : "✕"}
              </div>
              <p className="mt-4 text-xl font-extrabold text-text-primary">
                ยืนยันการ
                {confirmTarget.decision === "approve"
                  ? "อนุมัติการยกเลิก"
                  : "ปฏิเสธคำขอ"}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {confirmTarget.booking.title}
                <br />
                <span className="font-mono text-text-muted">
                  {confirmTarget.booking.ref_id}
                </span>
              </p>
              <div className="mt-5 flex gap-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmTarget(null)}
                >
                  ยกเลิก
                </Button>
                <Button
                  variant={
                    confirmTarget.decision === "approve" ? "success" : "dangerSolid"
                  }
                  className="flex-1"
                  onClick={handleConfirm}
                  disabled={submitting}
                >
                  {submitting ? "กำลังบันทึก..." : "ยืนยัน"}
                </Button>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </div>
  );
}
