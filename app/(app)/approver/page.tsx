"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { FieldTable, type FieldRow } from "@/components/ui/FieldTable";
import { StatusMarker } from "@/components/ui/StatusMarker";

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

type ResolvedEntry = {
  id: string;
  action: "approved" | "rejected";
  note: string | null;
  acted_at: string;
  ref_id: string;
  title: string;
  room_name: string;
  requester_name: string;
  start_time: string | null;
  end_time: string | null;
  attendees: number | null;
};

type FilterTab = "pending" | "approved" | "rejected";

const CHAIN_STEPS = ["แอดมิน", "ผู้อนุมัติ 1", "ผู้อนุมัติ 2"];

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

/* ลำดับการอนุมัติ 3 ขั้น: done → current → wait — ปรับให้เข้ากับเส้น hairline */
function ApprovalChain({ doneCount }: { doneCount: number }) {
  return (
    <div className="border-t border-neutral-200 bg-surface-sunken px-4 py-3">
      <p className="mb-2 text-xs font-bold tracking-wider text-text-muted">
        ลำดับการอนุมัติ
      </p>
      <div className="flex items-center">
        {CHAIN_STEPS.map((name, i) => {
          const state =
            i < doneCount ? "done" : i === doneCount ? "current" : "wait";
          const last = i === CHAIN_STEPS.length - 1;
          return (
            <div
              key={name}
              className={`flex min-w-0 items-center ${last ? "flex-none" : "flex-1"}`}
            >
              <div className="flex flex-none items-center gap-2">
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center text-xs font-bold ${
                    state === "done"
                      ? "bg-grad-brand text-text-on-primary"
                      : state === "current"
                        ? "border-[1.5px] border-warning-accent bg-warning-surface text-warning-text"
                        : "border-[1.5px] border-neutral-300 bg-surface-card text-neutral-400"
                  }`}
                >
                  {state === "done" ? "✓" : state === "current" ? "•" : i + 1}
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span
                    className={`whitespace-nowrap text-sm font-semibold ${
                      state === "done"
                        ? "text-neutral-700"
                        : state === "current"
                          ? "text-warning-text"
                          : "text-neutral-400"
                    }`}
                  >
                    {name}
                  </span>
                  <span
                    className={`whitespace-nowrap text-xs ${
                      state === "done"
                        ? "text-text-muted"
                        : state === "current"
                          ? "text-warning-accent"
                          : "text-neutral-400"
                    }`}
                  >
                    {state === "done"
                      ? "อนุมัติแล้ว"
                      : state === "current"
                        ? "รอดำเนินการ"
                        : "รอลำดับก่อนหน้า"}
                  </span>
                </span>
              </div>
              {!last && (
                <span
                  className={`mx-2 h-0.5 min-w-3 flex-1 ${
                    i < doneCount ? "bg-brand-primary" : "bg-neutral-200"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* chip กรอง — active = ขอบ/underline ม่วงหนา (เลิก gradient เต็ม) */
function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 cursor-pointer items-center gap-2 rounded-[2px] border px-4 text-sm font-bold transition-colors ${
        active
          ? "border-brand-primary bg-neutral-50 text-brand-primary-strong"
          : "border-neutral-300 bg-surface-card text-neutral-700 hover:bg-neutral-50"
      }`}
    >
      {label}
      <span
        className={`rounded-[2px] px-2 py-px text-xs font-bold ${
          active
            ? "bg-brand-primary text-text-on-primary"
            : "bg-neutral-150 text-brand-primary-strong"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

export default function ApproverPage() {
  const [myStep, setMyStep] = useState<number | null>(null);
  const [bookings, setBookings] = useState<PendingBooking[]>([]);
  const [resolved, setResolved] = useState<ResolvedEntry[]>([]);
  const [filter, setFilter] = useState<FilterTab>("pending");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    booking: PendingBooking;
    action: "approved" | "rejected";
  } | null>(null);
  const [detailTarget, setDetailTarget] = useState<PendingBooking | null>(null);
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
      setResolved([]);
      setLoading(false);
      return;
    }

    const [queueRes, logsRes] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, ref_id, title, activity, attendees, start_time, end_time, created_at, rooms(name), users(full_name)"
        )
        .eq("final_status", "pending")
        .eq("current_step", step - 1)
        .order("created_at", { ascending: true }),
      supabase
        .from("approval_logs")
        .select(
          "id, action, note, acted_at, bookings(ref_id, title, start_time, end_time, attendees, rooms(name), users(full_name))"
        )
        .eq("approver_id", user.id)
        .order("acted_at", { ascending: false })
        .limit(50),
    ]);

    if (queueRes.error) {
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
      ((queueRes.data ?? []) as unknown as Row[]).map((b) => ({
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

    type LogRow = {
      id: string;
      action: "approved" | "rejected";
      note: string | null;
      acted_at: string;
      bookings: {
        ref_id: string;
        title: string;
        start_time: string | null;
        end_time: string | null;
        attendees: number | null;
        rooms: { name: string } | null;
        users: { full_name: string } | null;
      } | null;
    };

    setResolved(
      ((logsRes.data ?? []) as unknown as LogRow[]).map((r) => ({
        id: r.id,
        action: r.action,
        note: r.note,
        acted_at: r.acted_at,
        ref_id: r.bookings?.ref_id ?? "",
        title: r.bookings?.title ?? "",
        room_name: r.bookings?.rooms?.name ?? "",
        requester_name: r.bookings?.users?.full_name ?? "",
        start_time: r.bookings?.start_time ?? null,
        end_time: r.bookings?.end_time ?? null,
        attendees: r.bookings?.attendees ?? null,
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

  const approvedEntries = resolved.filter((e) => e.action === "approved");
  const rejectedEntries = resolved.filter((e) => e.action === "rejected");
  const resolvedShown = filter === "approved" ? approvedEntries : rejectedEntries;

  return (
    <div className="animate-fade-in-up pb-10">
      <PageHeader
        title="คำขออนุมัติ"
        subtitle={
          !loading && myStep !== null && bookings.length > 0 ? (
            <>
              มี{" "}
              <strong className="font-extrabold text-brand-primary-strong">
                {bookings.length}
              </strong>{" "}
              รายการรอการอนุมัติของคุณ
            </>
          ) : (
            "ตรวจสอบและอนุมัติคำขอจองห้องประชุม"
          )
        }
        width="max-w-2xl"
      />
      <div className="relative mx-auto mt-6 max-w-2xl px-6">
        {loadError && (
          <p className="mb-4 text-sm text-danger-text">{loadError}</p>
        )}
        {actionError && (
          <p className="mb-4 text-sm text-danger-text">{actionError}</p>
        )}

        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {!loading && myStep === null && !loadError && (
          <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
            ท่านไม่ได้อยู่ใน Approval Chain
          </div>
        )}

        {!loading && myStep !== null && (
          <>
            <div className="mb-5 flex flex-wrap gap-2">
              <FilterChip
                active={filter === "pending"}
                label="รอการอนุมัติ"
                count={bookings.length}
                onClick={() => setFilter("pending")}
              />
              <FilterChip
                active={filter === "approved"}
                label="อนุมัติแล้ว"
                count={approvedEntries.length}
                onClick={() => setFilter("approved")}
              />
              <FilterChip
                active={filter === "rejected"}
                label="ปฏิเสธแล้ว"
                count={rejectedEntries.length}
                onClick={() => setFilter("rejected")}
              />
            </div>

            {filter === "pending" && (
              <div className="space-y-4">
                {bookings.length === 0 && (
                  <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
                    ไม่มีคำขอรออนุมัติในขณะนี้
                  </div>
                )}
                {bookings.map((b) => {
                  const waited = waitingMinutes(b.created_at);
                  const urgent = waited > 120;
                  const waitText =
                    waited >= 60
                      ? `รอมาแล้ว ${
                          Number.isInteger(waited / 60)
                            ? waited / 60
                            : (waited / 60).toFixed(1)
                        } ชม.`
                      : `รอมาแล้ว ${waited} นาที`;
                  const rows: FieldRow[] = [
                    { label: "ผู้จอง", value: b.requester_name },
                    { label: "วันที่", value: fmtDate(b.start_time) },
                    {
                      label: "เวลา",
                      value: `${fmtTime(b.start_time)}–${fmtTime(b.end_time)} น.`,
                      mono: true,
                    },
                    { label: "ผู้เข้าร่วม", value: `${b.attendees} คน` },
                  ];
                  return (
                    <EditorialCard key={b.id} accent={urgent ? "warning" : "brand"}>
                      <EditorialCard.Section>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-lg font-bold text-text-primary">
                              {b.room_name}
                            </p>
                            <StatusMarker tone="warning">รออนุมัติ</StatusMarker>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs text-text-muted">
                              {b.ref_id}
                            </span>
                            <span
                              className={`text-sm font-semibold ${
                                urgent ? "text-danger-text" : "text-text-muted"
                              }`}
                            >
                              {waitText}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-md font-bold text-text-primary">
                          {b.title}
                        </p>
                      </EditorialCard.Section>

                      <EditorialCard.Section className="!py-0">
                        <FieldTable rows={rows} />
                      </EditorialCard.Section>

                      <ApprovalChain doneCount={(myStep ?? 1) - 1} />

                      <div className="flex border-t border-neutral-300">
                        <button
                          type="button"
                          onClick={() => setDetailTarget(b)}
                          className="flex-1 cursor-pointer border-r border-neutral-200 py-3 text-sm font-bold text-text-secondary transition-colors hover:bg-neutral-50"
                        >
                          รายละเอียด
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmTarget({ booking: b, action: "rejected" })
                          }
                          className="flex-1 cursor-pointer border-r border-neutral-200 py-3 text-sm font-bold text-warning-text transition-colors hover:bg-warning-surface"
                        >
                          ปฏิเสธ
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmTarget({ booking: b, action: "approved" })
                          }
                          className="bg-grad-success flex-1 cursor-pointer py-3 text-sm font-bold text-text-on-primary transition-transform hover:scale-[1.01]"
                        >
                          อนุมัติ
                        </button>
                      </div>
                    </EditorialCard>
                  );
                })}
              </div>
            )}

            {filter !== "pending" && (
              <div className="space-y-4">
                {resolvedShown.length === 0 && (
                  <div className="rounded-[2px] border border-dashed border-neutral-400 bg-surface-card p-10 text-center text-md text-text-muted">
                    ไม่มีรายการในหมวดนี้
                  </div>
                )}
                {resolvedShown.map((e) => {
                  const rows: FieldRow[] = [
                    { label: "ผู้จอง", value: e.requester_name || "-" },
                    ...(e.start_time && e.end_time
                      ? [
                          {
                            label: "วันที่",
                            value: fmtDate(e.start_time),
                          },
                          {
                            label: "เวลา",
                            value: `${fmtTime(e.start_time)}–${fmtTime(e.end_time)} น.`,
                            mono: true,
                          },
                        ]
                      : []),
                    ...(e.attendees !== null
                      ? [{ label: "ผู้เข้าร่วม", value: `${e.attendees} คน` }]
                      : []),
                    { label: "รหัสอ้างอิง", value: e.ref_id, mono: true },
                  ];
                  return (
                    <EditorialCard
                      key={e.id}
                      accent={e.action === "approved" ? "success" : "danger"}
                    >
                      <EditorialCard.Section>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-lg font-bold text-text-primary">
                            {e.room_name || e.title}
                          </p>
                          <StatusMarker
                            tone={e.action === "approved" ? "success" : "danger"}
                          >
                            {e.action === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"}
                          </StatusMarker>
                        </div>
                        <p className="mt-2 text-md font-bold text-text-primary">
                          {e.title}
                        </p>
                      </EditorialCard.Section>

                      <EditorialCard.Section className="!py-0">
                        <FieldTable rows={rows} />
                      </EditorialCard.Section>

                      {e.note && (
                        <EditorialCard.Section>
                          <p className="text-sm text-text-primary">
                            เหตุผล: {e.note}
                          </p>
                        </EditorialCard.Section>
                      )}

                      <EditorialCard.Section>
                        <p className="text-sm italic text-text-muted">
                          {e.action === "approved"
                            ? "อนุมัติแล้ว — ไม่ต้องดำเนินการเพิ่ม"
                            : "ปฏิเสธแล้ว"}{" "}
                          · {new Date(e.acted_at).toLocaleString("th-TH")}
                        </p>
                      </EditorialCard.Section>
                    </EditorialCard>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* dialog รายละเอียด */}
        <Modal open={detailTarget !== null} onClose={() => setDetailTarget(null)}>
          {detailTarget && (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <StatusMarker tone="warning">รออนุมัติ</StatusMarker>
                  <h2 className="mt-2 text-xl font-bold leading-snug text-text-primary">
                    {detailTarget.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailTarget(null)}
                  aria-label="ปิด"
                  className="h-8 w-8 flex-none cursor-pointer rounded-[2px] bg-neutral-100 text-md text-text-secondary hover:bg-neutral-150"
                >
                  ✕
                </button>
              </div>
              <div className="mt-3 border-t border-neutral-200 pt-2">
                <FieldTable
                  rows={[
                    { label: "ห้อง", value: detailTarget.room_name },
                    { label: "ผู้จอง", value: detailTarget.requester_name },
                    {
                      label: "วันเวลา",
                      value: `${fmtDate(detailTarget.start_time)} · ${fmtTime(
                        detailTarget.start_time
                      )}–${fmtTime(detailTarget.end_time)} น.`,
                      mono: true,
                    },
                    {
                      label: "ผู้เข้าร่วม",
                      value: `${detailTarget.attendees} คน`,
                    },
                    { label: "รหัสอ้างอิง", value: detailTarget.ref_id, mono: true },
                    ...(detailTarget.activity
                      ? [{ label: "กิจกรรม", value: detailTarget.activity }]
                      : []),
                  ]}
                />
              </div>
            </>
          )}
        </Modal>

        {/* dialog ยืนยัน */}
        <Modal open={confirmTarget !== null} onClose={() => setConfirmTarget(null)}>
          {confirmTarget && (
            <div className="text-center">
              <div
                className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold text-text-on-primary ${
                  confirmTarget.action === "approved"
                    ? "bg-grad-success shadow-success"
                    : "bg-grad-danger"
                }`}
              >
                {confirmTarget.action === "approved" ? "✓" : "✕"}
              </div>
              <p className="mt-4 text-xl font-extrabold text-text-primary">
                ยืนยันการ{confirmTarget.action === "approved" ? "อนุมัติ" : "ปฏิเสธ"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-text-secondary">
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
                    confirmTarget.action === "approved" ? "success" : "dangerSolid"
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
