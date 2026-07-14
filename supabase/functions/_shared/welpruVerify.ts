import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { ValidationError, ConflictError, ForbiddenError } from "./errors.ts";
import { sendWelpruPush } from "./welpruClient.ts";

function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RequestWelpruVerifyParams {
  userId: string;
  staffId: string;
  siteUrl: string;
}

export async function requestWelpruVerify(
  client: SupabaseClient,
  params: RequestWelpruVerifyParams,
  sendPush: typeof sendWelpruPush = sendWelpruPush
): Promise<{ token: string }> {
  const staffId = params.staffId.trim();
  if (!staffId) {
    throw new ValidationError("กรุณากรอกรหัสบุคลากรก่อนยืนยัน");
  }

  // Guard: staffId ที่ส่งมาต้องตรงกับที่บันทึกไว้ในโปรไฟล์ของผู้ใช้เอง
  // กันการส่ง push ทดสอบไปหา staff_id ของคนอื่น (พิมพ์ผิด หรือเรียก API ตรง
  // ด้วยรหัสที่ไม่ใช่ของตน) — ต้องเช็คก่อน insert token และก่อนส่ง push ใดๆ
  const { data: userRow, error: userError } = await client
    .from("users")
    .select("staff_id")
    .eq("id", params.userId)
    .single();
  if (userError || !userRow) {
    throw new ForbiddenError("ไม่พบข้อมูลผู้ใช้งาน");
  }
  const storedStaffId = (userRow as { staff_id: string | null }).staff_id;
  if (!storedStaffId || storedStaffId !== staffId) {
    throw new ValidationError(
      "รหัสบุคลากรไม่ตรงกับข้อมูลในโปรไฟล์ กรุณาบันทึกรหัสบุคลากรก่อนยืนยัน"
    );
  }

  const token = generateToken();

  const { error: insertError } = await client.from("welpru_link_tokens").insert({
    user_id: params.userId,
    staff_id: staffId,
    token,
  });
  if (insertError) throw insertError;

  const link = `${params.siteUrl}/profile/welpru-verify?token=${token}`;
  await sendPush({
    staffIds: [staffId],
    title: "ยืนยันการรับแจ้งเตือน",
    body: "แตะลิงก์นี้เพื่อยืนยันการรับแจ้งเตือนจากระบบจองห้องประชุม",
    link,
  });

  return { token };
}

export interface ConfirmWelpruVerifyParams {
  userId: string;
  token: string;
}

export async function confirmWelpruVerify(
  client: SupabaseClient,
  params: ConfirmWelpruVerifyParams
): Promise<void> {
  // Atomic: UPDATE พร้อม WHERE is_used=false (Critical Rule 6) — กัน race
  const { data: updated, error: updateError } = await client
    .from("welpru_link_tokens")
    .update({ is_used: true })
    .eq("token", params.token)
    .eq("is_used", false)
    .eq("user_id", params.userId)
    .gt("expires_at", new Date().toISOString())
    .select("staff_id");

  if (updateError) throw updateError;
  if (!updated || (updated as unknown[]).length === 0) {
    throw new ConflictError("ลิงก์ยืนยันหมดอายุหรือถูกใช้ไปแล้ว กรุณาขอยืนยันใหม่");
  }

  const tokenStaffId = (updated as { staff_id: string }[])[0].staff_id;

  const { data: userRow, error: userError } = await client
    .from("users")
    .select("staff_id")
    .eq("id", params.userId)
    .single();
  if (userError || !userRow) {
    throw new ForbiddenError("ไม่พบข้อมูลผู้ใช้งาน");
  }

  const currentStaffId = (userRow as { staff_id: string | null }).staff_id;
  if (currentStaffId !== tokenStaffId) {
    throw new ConflictError(
      "รหัสบุคลากรมีการเปลี่ยนแปลงหลังขอยืนยัน กรุณาขอยืนยันใหม่"
    );
  }

  const { error: verifyError } = await client
    .from("users")
    .update({ welpru_verified_at: new Date().toISOString() })
    .eq("id", params.userId);
  if (verifyError) throw verifyError;

  const { error: consentError } = await client.from("consent_records").insert({
    user_id: params.userId,
    consent_type: "welpru_linking",
  });
  if (consentError) throw consentError;
}
