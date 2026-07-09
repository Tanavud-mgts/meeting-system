import { withRetry, RetryableHttpError } from "./retry.ts";

const DISCORD_USERNAME = "ระบบจองห้องประชุม LPRU";

// Pure classification logic — testable โดยไม่ต้องเรียก fetch จริง
export function classifyDiscordResponse(
  status: number,
  retryAfterHeader: string | null
): "ok" | Error {
  if (status >= 200 && status < 300) return "ok";

  if (status === 429) {
    const retryAfterMs = retryAfterHeader
      ? parseFloat(retryAfterHeader) * 1000
      : undefined;
    return new RetryableHttpError(`Discord rate limited: ${status}`, retryAfterMs);
  }

  return new Error(`Discord webhook failed: ${status}`);
}

async function postToDiscord(webhookUrl: string, message: string): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message, username: DISCORD_USERNAME }),
  });

  const outcome = classifyDiscordResponse(
    response.status,
    response.headers.get("Retry-After")
  );
  if (outcome !== "ok") throw outcome;
}

// ยิงข้อความเดียวไป Discord webhook พร้อม retry (เคารพ Retry-After บน 429)
export async function sendDiscord(message: string): Promise<void> {
  const webhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!webhookUrl) {
    throw new Error("DISCORD_WEBHOOK_URL ไม่ได้ตั้งค่า");
  }
  await withRetry(() => postToDiscord(webhookUrl, message), { maxAttempts: 3 });
}
