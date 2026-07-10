import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { ApprovalResult } from "./processApproval.ts";
import { notifyAndLog, formatThaiDate, formatThaiTimeRange } from "./notify.ts";

// step number → ฟิลด์ผู้อนุมัติใน system_config
const STEP_FIELD: Record<number, "admin_id" | "approver1_id" | "approver2_id"> = {
  1: "admin_id",
  2: "approver1_id",
  3: "approver2_id",
};

interface BookingDetailRow {
  requester_id: string;
  requester_name: string;
  room_name: string;
  start_time: string;
  end_time: string;
  cancellation_reason: string | null;
}

interface ChainRow {
  admin_id: string | null;
  approver1_id: string | null;
  approver2_id: string | null;
}

async function loadDetail(
  client: SupabaseClient,
  bookingId: string
): Promise<BookingDetailRow | null> {
  const { data, error } = await client
    .from("booking_detail")
    .select("requester_id, requester_name, room_name, start_time, end_time, cancellation_reason")
    .eq("id", bookingId)
    .single();
  if (error || !data) return null;
  return data as BookingDetailRow;
}

async function loadChain(client: SupabaseClient): Promise<ChainRow | null> {
  const { data, error } = await client
    .from("system_config")
    .select("admin_id, approver1_id, approver2_id")
    .single();
  if (error || !data) return null;
  return data as ChainRow;
}

async function loadUserName(client: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await client
    .from("users")
    .select("full_name")
    .eq("id", userId)
    .single();
  if (error || !data) return "ผู้อนุมัติ";
  return (data as { full_name: string }).full_name;
}

// ตัวแปรพื้นฐานจาก booking_detail (booker/room/date/time)
function baseVars(d: BookingDetailRow): Record<string, string> {
  return {
    booker: d.requester_name,
    room: d.room_name,
    date: formatThaiDate(d.start_time),
    time: formatThaiTimeRange(d.start_time, d.end_time),
  };
}

export async function notifyBookingSubmitted(
  client: SupabaseClient,
  bookingId: string
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    const chain = await loadChain(client);
    if (!d || !chain?.admin_id) return;
    await notifyAndLog(client, {
      eventKey: "booking_submitted",
      recipients: [{ userId: chain.admin_id }],
      variables: baseVars(d),
    });
  } catch (err) {
    console.error("[notifyBookingSubmitted]", err);
  }
}

export async function notifyApprovalOutcome(
  client: SupabaseClient,
  bookingId: string,
  result: ApprovalResult,
  note?: string
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    const base = baseVars(d);

    if (result.action === "rejected") {
      await notifyAndLog(client, {
        eventKey: "booking_rejected",
        recipients: [{ userId: d.requester_id }],
        variables: { ...base, reason: (note ?? "").trim() || "ไม่ระบุ", step: String(result.step) },
      });
      return;
    }

    if (result.finalStatus === "approved") {
      await notifyAndLog(client, {
        eventKey: "booking_approved",
        recipients: [{ userId: d.requester_id }],
        variables: base,
      });
      return;
    }

    // อนุมัติแบบยังไม่จบ chain → แจ้ง approver ขั้นถัดไป
    const chain = await loadChain(client);
    const nextField = STEP_FIELD[result.currentStep + 1];
    const nextApprover = nextField ? chain?.[nextField] : null;
    if (nextApprover) {
      const approverName = await loadUserName(client, nextApprover);
      await notifyAndLog(client, {
        eventKey: "booking_step_approved",
        recipients: [{ userId: nextApprover }],
        variables: { ...base, step: String(result.step), approver: approverName },
      });
    }
  } catch (err) {
    console.error("[notifyApprovalOutcome]", err);
  }
}

export async function notifyCancellationRequested(
  client: SupabaseClient,
  bookingId: string,
  reason: string
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    const chain = await loadChain(client);
    if (!d || !chain?.admin_id) return;
    await notifyAndLog(client, {
      eventKey: "cancellation_requested",
      recipients: [{ userId: chain.admin_id }],
      variables: { ...baseVars(d), reason: reason.trim() || "ไม่ระบุ" },
    });
  } catch (err) {
    console.error("[notifyCancellationRequested]", err);
  }
}

export async function notifyCancellationDecision(
  client: SupabaseClient,
  bookingId: string,
  decision: "approve" | "reject"
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    if (decision === "approve") {
      await notifyAndLog(client, {
        eventKey: "cancellation_approved",
        recipients: [{ userId: d.requester_id }],
        variables: baseVars(d),
      });
    } else {
      await notifyAndLog(client, {
        eventKey: "cancellation_denied",
        recipients: [{ userId: d.requester_id }],
        variables: { ...baseVars(d), reason: (d.cancellation_reason ?? "").trim() || "ไม่ระบุ" },
      });
    }
  } catch (err) {
    console.error("[notifyCancellationDecision]", err);
  }
}

export async function notifyBookingCancelledByAdmin(
  client: SupabaseClient,
  bookingId: string,
  reason: string
): Promise<void> {
  try {
    const d = await loadDetail(client, bookingId);
    if (!d) return;
    await notifyAndLog(client, {
      eventKey: "booking_cancelled",
      recipients: [{ userId: d.requester_id }],
      variables: { ...baseVars(d), reason: reason.trim() || "ไม่ระบุ" },
    });
  } catch (err) {
    console.error("[notifyBookingCancelledByAdmin]", err);
  }
}
