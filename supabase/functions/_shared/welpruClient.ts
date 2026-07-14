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

async function postWelpruPush(
  apiKey: string,
  payload: { user_id: string; title: string; body: string; link?: string }
): Promise<void> {
  const response = await fetch(`${WELPRU_API_URL}/notify/user`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(`WeLPRU push failed: ${response.status}`);
  }
}

// ส่งแยกทีละ user (WeLPRU API รับ user_id เป็น string เดี่ยว) — partial success ถือว่าสำเร็จ
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

  const safeTitle = truncateText(params.title, 50);
  const safeBody = truncateText(params.body, 250);
  const link = safeLink(params.link, 255);

  const results = await Promise.allSettled(
    params.staffIds.map((staffId) =>
      withRetry(() =>
        postWelpruPush(apiKey, { user_id: staffId, title: safeTitle, body: safeBody, link })
      )
    )
  );

  const failedCount = results.filter((r) => r.status === "rejected").length;
  return { success: failedCount < params.staffIds.length, failedCount };
}
