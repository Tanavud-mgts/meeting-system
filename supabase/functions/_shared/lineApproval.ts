import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { processApproval } from "./processApproval.ts";
import { notifyApprovalOutcome } from "./bookingNotify.ts";
import { ConflictError } from "./errors.ts";

// สร้าง approval_token — ชน unique partial index (23505) = มี active token
// ของ step นี้อยู่แล้ว → ดึงตัวเดิมมา reuse; error อื่น → null (ข้าม LINE เงียบ)
export async function createOrReuseApprovalToken(
  client: SupabaseClient,
  params: { bookingId: string; step: number; approverId: string }
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("approval_tokens")
      .insert({ booking_id: params.bookingId, step: params.step, approver_id: params.approverId })
      .select("id")
      .single();

    if (!error && data) return (data as { id: string }).id;

    if (error && (error as { code?: string }).code === "23505") {
      const { data: existing } = await client
        .from("approval_tokens")
        .select("id")
        .eq("booking_id", params.bookingId)
        .eq("step", params.step)
        .eq("is_used", false)
        .single();
      return existing ? (existing as { id: string }).id : null;
    }

    return null;
  } catch (err) {
    console.error("[createOrReuseApprovalToken]", err);
    return null;
  }
}

export interface ApprovalPostbackDeps {
  processApproval: typeof processApproval;
  notifyApprovalOutcome: typeof notifyApprovalOutcome;
}

const DEFAULT_DEPS: ApprovalPostbackDeps = { processApproval, notifyApprovalOutcome };

export async function handleApprovalPostback(
  client: SupabaseClient,
  params: { tokenId: string; action: "approve" | "reject"; lineUserId: string },
  deps: ApprovalPostbackDeps = DEFAULT_DEPS
): Promise<{ replyText: string }> {
  // 1. อ่าน token (read-only) — ยังไม่แตะ is_used
  const { data: tok, error: tokErr } = await client
    .from("approval_tokens")
    .select("booking_id, step, approver_id, is_used")
    .eq("id", params.tokenId)
    .single();
  if (tokErr || !tok) {
    return { replyText: "ไม่พบคำขอนี้ อาจถูกยกเลิกหรือหมดอายุแล้ว" };
  }
  const token = tok as { booking_id: string; step: number; approver_id: string };

  // 2. identity check ก่อน consume — คนผิดกดต้องไม่เผา token ของ approver ตัวจริง
  const { data: approver } = await client
    .from("users")
    .select("line_user_id")
    .eq("id", token.approver_id)
    .single();
  if (!approver || (approver as { line_user_id: string | null }).line_user_id !== params.lineUserId) {
    return { replyText: "ไม่สามารถดำเนินการได้ กรุณาตรวจสอบที่หน้าเว็บ" };
  }

  // 3. atomic consume (Rule 6) — guard ทุกตัวใน WHERE ของ UPDATE เดียว
  const { data: consumed } = await client
    .from("approval_tokens")
    .update({ is_used: true })
    .eq("id", params.tokenId)
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .select("id");
  if (!consumed || (consumed as unknown[]).length === 0) {
    return { replyText: "คำขอนี้ถูกดำเนินการไปแล้วหรือลิงก์หมดอายุ กรุณาตรวจสอบที่หน้าเว็บ" };
  }

  // 4. processApproval ตัวเดียวกับเว็บ (Rule 2)
  try {
    const result = await deps.processApproval(client, {
      bookingId: token.booking_id,
      step: token.step,
      approverId: token.approver_id,
      action: params.action === "approve" ? "approved" : "rejected",
    });
    await deps.notifyApprovalOutcome(client, token.booking_id, result);
    return {
      replyText: params.action === "approve" ? "✅ อนุมัติเรียบร้อยแล้ว" : "❌ ปฏิเสธเรียบร้อยแล้ว",
    };
  } catch (err) {
    if (err instanceof ConflictError) {
      return { replyText: "คำขอนี้ถูกดำเนินการไปแล้ว กรุณาตรวจสอบที่หน้าเว็บ" };
    }
    console.error("[handleApprovalPostback] processApproval", err);
    return { replyText: "เกิดข้อผิดพลาด กรุณาตรวจสอบที่หน้าเว็บ" };
  }
}

// /link XXXXXX — atomic consume OTP → ผูก line_user_id + consent
export async function handleLinkCommand(
  client: SupabaseClient,
  params: { otp: string; lineUserId: string }
): Promise<{ replyText: string }> {
  const { data: consumed } = await client
    .from("line_link_tokens")
    .update({ is_used: true })
    .eq("otp", params.otp)
    .eq("is_used", false)
    .gt("expires_at", new Date().toISOString())
    .select("user_id");
  if (!consumed || (consumed as unknown[]).length === 0) {
    return { replyText: "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาขอรหัสใหม่จากหน้าโปรไฟล์" };
  }
  const userId = (consumed as { user_id: string }[])[0].user_id;

  // consent ต้องถูกบันทึกก่อนผูกบัญชีเสมอ (PDPA) — ถ้า insert ล้มเหลว ห้ามผูก
  // (consent ที่บันทึกแล้วแต่ link ล้มเหลวทีหลังไม่เป็นไร ผู้ใช้ยินยอมแล้วตอนสั่ง /link)
  const { error: consentErr } = await client
    .from("consent_records")
    .insert({ user_id: userId, consent_type: "line_linking" });
  if (consentErr) {
    console.error("[handleLinkCommand] consent_records insert ล้มเหลว:", consentErr);
    return { replyText: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }

  const { error: updErr } = await client
    .from("users")
    .update({ line_user_id: params.lineUserId })
    .eq("id", userId);
  if (updErr) {
    if ((updErr as { code?: string }).code === "23505") {
      return { replyText: "บัญชี LINE นี้ถูกเชื่อมกับผู้ใช้อื่นแล้ว" };
    }
    return { replyText: "เกิดข้อผิดพลาด กรุณาลองใหม่" };
  }

  return { replyText: "✅ เชื่อมต่อบัญชี LINE สำเร็จ" };
}
