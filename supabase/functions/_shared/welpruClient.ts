import { withRetry } from "./retry.ts";

const WELPRU_API_URL = "https://api.lpruhub.com/api";

// ── Pure truncation helpers (WeLPRU ใช้ MSSQL backend ที่มีข้อจำกัดความยาว) ──
export function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  if (maxLen <= 3) return text.slice(0, maxLen);
  return text.slice(0, maxLen - 3) + "...";
}

export function safeLink(link: string | undefined, maxLen: number): string | undefined {
  if (!link) return undefined;
  return link.length > maxLen ? undefined : link;
}

export interface SendWelpruPushParams {
  staffIds: string[];
  title: string;
  body: string;
  link?: string;
}

export interface SendWelpruPushResult {
  success: boolean;
  failedCount: number;
}

// POST /api/notify/user รับ "user_ids" เป็น array (ส่ง bulk ในครั้งเดียว)
// ★ ห้ามใช้ user_id เดี่ยว — API เป็น async ตอบ 202 ทันทีแม้ field ผิด แล้ว queued 0 (ไม่ส่งจริง)
export interface WelpruPushPayload {
  user_ids: string[];
  title: string;
  body: string;
  link?: string;
}

// ── Pure: ประกอบ payload ตามสเปก (title/body ตัดตามขีดจำกัด WeLPRU, link ยาวเกินตัดทิ้ง) ──
export function buildWelpruPayload(
  staffIds: string[],
  title: string,
  body: string,
  link?: string
): WelpruPushPayload {
  return {
    user_ids: staffIds,
    title: truncateText(title, 50),
    body: truncateText(body, 250),
    link: safeLink(link, 255),
  };
}

// ── Pure: แปลงจำนวน queued (จาก 202 response) เป็นผลลัพธ์ — queued 0 = API รับแต่ไม่ได้ส่งจริง ──
export function interpretQueued(recipientCount: number, queued: number): SendWelpruPushResult {
  const failedCount = Math.max(0, recipientCount - queued);
  return { success: queued > 0, failedCount };
}

// ส่ง bulk ครั้งเดียว (API async → 202 Accepted {success, queued}) คืนจำนวน queued
async function postWelpruPush(apiKey: string, payload: WelpruPushPayload): Promise<number> {
  const response = await fetch(`${WELPRU_API_URL}/notify/user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`WeLPRU push failed: ${response.status}`);
  }
  const json = (await response.json().catch(() => ({}))) as { queued?: number };
  // ถ้าอ่าน queued ไม่ได้ (API เปลี่ยน format) fallback มองว่ารับครบ (2xx = สำเร็จ) เพื่อไม่ปิดกั้นการส่ง
  return typeof json.queued === "number" ? json.queued : payload.user_ids.length;
}

export async function sendWelpruPush(
  params: SendWelpruPushParams
): Promise<SendWelpruPushResult> {
  if (params.staffIds.length === 0) {
    return { success: true, failedCount: 0 };
  }

  const apiKey = Deno.env.get("WELPRU_API_KEY");
  if (!apiKey) {
    return { success: false, failedCount: params.staffIds.length };
  }

  const payload = buildWelpruPayload(
    params.staffIds,
    params.title,
    params.body,
    params.link
  );

  try {
    const queued = await withRetry(() => postWelpruPush(apiKey, payload));
    return interpretQueued(params.staffIds.length, queued);
  } catch {
    return { success: false, failedCount: params.staffIds.length };
  }
}
