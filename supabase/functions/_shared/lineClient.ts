const LINE_API = "https://api.line.me/v2/bot/message";

// ── Signature (HMAC-SHA256 ของ raw body → base64) — testable ──
// constant-time compare กัน timing attack บน base64 string
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyLineSignature(
  rawBody: string,
  signature: string,
  channelSecret: string
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
    return safeEqual(expected, signature);
  } catch {
    return false;
  }
}

// ── Postback data — testable ──
export function parsePostbackData(
  data: string
): { action: "approve" | "reject"; token: string } | null {
  const params = new URLSearchParams(data);
  const action = params.get("a");
  const token = params.get("t");
  if ((action !== "approve" && action !== "reject") || !token) return null;
  return { action, token };
}

// ── Flex card — testable ──
export function buildApprovalFlex(
  vars: { booker: string; room: string; date: string; time: string },
  tokenId: string,
  altText: string
): object {
  return {
    type: "flex",
    altText,
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: altText, weight: "bold", size: "md", wrap: true },
          { type: "text", text: `ผู้ขอ: ${vars.booker}`, size: "sm", color: "#555555", wrap: true },
          { type: "text", text: `ห้อง: ${vars.room}`, size: "sm", color: "#555555", wrap: true },
          { type: "text", text: `วันที่: ${vars.date}`, size: "sm", color: "#555555", wrap: true },
          { type: "text", text: `เวลา: ${vars.time}`, size: "sm", color: "#555555", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "horizontal",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#0d8a5f",
            action: { type: "postback", label: "อนุมัติ", data: `a=approve&t=${tokenId}`, displayText: "อนุมัติ" },
          },
          {
            type: "button",
            style: "secondary",
            action: { type: "postback", label: "ปฏิเสธ", data: `a=reject&t=${tokenId}`, displayText: "ปฏิเสธ" },
          },
        ],
      },
    },
  };
}

// ── Transport (Deno fetch — ไม่ unit-test, ทดสอบตอน live) ──
function accessToken(): string {
  const token = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN");
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN ไม่ได้ตั้งค่า");
  return token;
}

export async function pushFlex(lineUserId: string, flexMessage: object): Promise<void> {
  const res = await fetch(`${LINE_API}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken()}`,
    },
    body: JSON.stringify({ to: lineUserId, messages: [flexMessage] }),
  });
  if (!res.ok) {
    throw new Error(`LINE push failed: ${res.status} ${await res.text()}`);
  }
}

export async function replyText(replyToken: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API}/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken()}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE reply failed: ${res.status} ${await res.text()}`);
  }
}

// ส่งข้อความ text เข้าห้องแชท/กลุ่ม (to = groupId) — ใช้กับกลุ่มแม่บ้าน
// Transport ล้วน (ทดสอบตอน live เหมือน pushFlex) — throw เมื่อไม่ใช่ 2xx
export async function pushTextToGroup(groupId: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API}/push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken()}`,
    },
    body: JSON.stringify({ to: groupId, messages: [{ type: "text", text }] }),
  });
  if (!res.ok) {
    throw new Error(`LINE group push failed: ${res.status} ${await res.text()}`);
  }
}
