import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyLineSignature, parsePostbackData, replyText, isGroupContext } from "../_shared/lineClient.ts";
import { handleApprovalPostback, handleLinkCommand } from "../_shared/lineApproval.ts";
import { logIntegration } from "../_shared/integrationLog.ts";

// line-webhook: verify_jwt=false (LINE เรียก, ใช้ signature แทน)
// ต้องตอบ 200 เสมอยกเว้น signature ผิด (401) — กัน LINE retry ซ้ำ
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const rawBody = await req.text();
  const signature = req.headers.get("X-Line-Signature") ?? "";
  const secret = Deno.env.get("LINE_CHANNEL_SECRET") ?? "";

  const valid = await verifyLineSignature(rawBody, signature, secret);
  if (!valid) {
    return new Response("invalid signature", { status: 401 });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let payload: { events?: LineEvent[] };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("ok", { status: 200 });
  }

  for (const event of payload.events ?? []) {
    try {
      await handleEvent(adminClient, event);
    } catch (err) {
      // business/unexpected error → log แต่ยังตอบ 200 กัน LINE retry
      console.error("[line-webhook] handleEvent", err);
    }
  }

  return new Response("ok", { status: 200 });
});

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string; type?: string; groupId?: string; roomId?: string };
  postback?: { data: string };
  message?: { type: string; text?: string };
}

async function handleEvent(
  // deno-lint-ignore no-explicit-any
  client: any,
  event: LineEvent
): Promise<void> {
  const lineUserId = event.source?.userId;
  const replyToken = event.replyToken;
  const groupId = event.source?.groupId ?? event.source?.roomId;

  // กลุ่ม/ห้อง: OA ไม่ตอบใดๆ (กัน noise) — ดัก groupId ตอน join หรือมีข้อความ (ครั้งแรกต่อกลุ่ม)
  if (isGroupContext(event.source)) {
    if (groupId && (event.type === "join" || event.type === "message")) {
      await captureGroupId(client, groupId);
    }
    return;
  }

  // ── ต่อไปนี้เฉพาะแชท 1:1 ──

  // postback อนุมัติ/ปฏิเสธ
  if (event.type === "postback" && event.postback && lineUserId && replyToken) {
    const parsed = parsePostbackData(event.postback.data);
    if (!parsed) return;
    const { replyText: text } = await handleApprovalPostback(client, {
      tokenId: parsed.token,
      action: parsed.action,
      lineUserId,
    });
    await replyText(replyToken, text);
    return;
  }

  // message
  if (event.type === "message" && event.message?.type === "text" && lineUserId && replyToken) {
    const text = (event.message.text ?? "").trim();
    const linkMatch = text.match(/^\/link\s+(\d{6})$/);
    if (linkMatch) {
      const { replyText: r } = await handleLinkCommand(client, { otp: linkMatch[1], lineUserId });
      await replyText(replyToken, r);
      return;
    }
    // ปุ่ม rich menu "ติดต่อสอบถาม" (text action) → ตอบข้อมูลผู้ดูแลระบบ
    if (text === "ติดต่อสอบถาม") {
      await replyText(
        replyToken,
        "📞 ติดต่อผู้ดูแลระบบ\nนายพิสิฐ เทียมเย็น\nโทร 089-8555668\nLINE ID: xmasball\nติดต่อได้ในเวลาราชการ"
      );
      return;
    }
    await replyText(
      replyToken,
      "พิมพ์ /link ตามด้วยรหัส 6 หลักจากหน้าโปรไฟล์ เพื่อเชื่อมบัญชี"
    );
    return;
  }

  // follow (เพิ่มเพื่อนครั้งแรก) → ใช้ greeting message ของ OA แทน ไม่ตอบซ้ำจาก webhook
  // event อื่น (unfollow, sticker ฯลฯ) → เมิน
}

// ดัก group ID เข้า integration_health — dedupe: log เฉพาะครั้งแรกต่อ groupId
// (ป้องกัน log ซ้ำทุกข้อความในกลุ่ม) — ไม่ห่อ try/catch เอง ให้ handleEvent จับ error รวม
async function captureGroupId(
  // deno-lint-ignore no-explicit-any
  client: any,
  groupId: string
): Promise<void> {
  const { count } = await client
    .from("integration_health")
    .select("*", { count: "exact", head: true })
    .eq("service", "line")
    .eq("payload->>kind", "group_join")
    .eq("payload->>groupId", groupId);
  if ((count ?? 0) > 0) return;
  await logIntegration(client, {
    service: "line",
    status: "success",
    payload: { kind: "group_join", groupId },
  });
}
