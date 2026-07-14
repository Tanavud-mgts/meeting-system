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
  detail?: string; // raw response / error เมื่อส่งไม่สำเร็จ (ops diagnosability)
}

// POST /api/notify/user (API จริง) รับ "user_id" เอกพจน์ ต่อ 1 คำขอ
// ★ เอกสารบางฉบับเขียน user_ids (array) แต่ API ที่ deploy จริงตอบ 400 ถ้าไม่ใช่ user_id
export interface WelpruPushPayload {
  user_id: string;
  title: string;
  body: string;
  link?: string;
}

// ── Pure: ประกอบ payload ต่อ 1 ผู้รับ (title/body ตัดตามขีดจำกัด, link ยาวเกินตัดทิ้ง) ──
export function buildWelpruPayload(
  staffId: string,
  title: string,
  body: string,
  link?: string
): WelpruPushPayload {
  return {
    user_id: staffId,
    title: truncateText(title, 50),
    body: truncateText(body, 250),
    link: safeLink(link, 255),
  };
}

// ส่ง 1 ผู้รับ — คืน raw response body (throw เมื่อไม่ใช่ 2xx พร้อมแนบ body เพื่อ diagnose)
async function postWelpruPush(apiKey: string, payload: WelpruPushPayload): Promise<string> {
  const response = await fetch(`${WELPRU_API_URL}/notify/user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(payload),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`WeLPRU push failed: ${response.status} ${raw}`);
  }
  return raw;
}

// ส่งแยกทีละ user (API รับ user_id เดี่ยว) — partial success ถือว่าสำเร็จ
export async function sendWelpruPush(
  params: SendWelpruPushParams
): Promise<SendWelpruPushResult> {
  if (params.staffIds.length === 0) {
    return { success: true, failedCount: 0 };
  }

  const apiKey = Deno.env.get("WELPRU_API_KEY");
  if (!apiKey) {
    return { success: false, failedCount: params.staffIds.length, detail: "WELPRU_API_KEY ไม่ได้ตั้งค่า" };
  }

  const results = await Promise.allSettled(
    params.staffIds.map((staffId) =>
      withRetry(() =>
        postWelpruPush(apiKey, buildWelpruPayload(staffId, params.title, params.body, params.link))
      )
    )
  );

  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === "rejected"
  );
  const okRaw = results.find(
    (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled"
  )?.value;

  const failedCount = rejected.length;
  const success = failedCount < params.staffIds.length;
  // แนบ diagnostic: error แรก (ถ้ามี fail) หรือ raw success response (เพื่อ ops เห็น queued/format จริง)
  const detail = failedCount > 0 ? String(rejected[0].reason) : okRaw;

  return { success, failedCount, detail };
}
