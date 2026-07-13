import { EVENT_KEYS } from "./notify.ts";

export interface EventSetting {
  discord?: boolean;
  welpru?: boolean;
  line?: boolean;
  title?: string | null;
  body?: string | null;
}

export type NotificationSettings = Record<string, EventSetting>;

export const MAX_TITLE = 200;
export const MAX_BODY = 1000;

const VALID_EVENTS = new Set<string>(EVENT_KEYS);
const BOOL_KEYS = ["discord", "welpru", "line"] as const;
const TEXT_KEYS = ["title", "body"] as const;
const ALLOWED_KEYS = new Set<string>([...BOOL_KEYS, ...TEXT_KEYS]);

type Result =
  | { ok: true; value: NotificationSettings }
  | { ok: false; error: string };

export function validateNotificationSettings(input: unknown): Result {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "การตั้งค่าแจ้งเตือนต้องเป็นออบเจกต์" };
  }

  const obj = input as Record<string, unknown>;

  const copiedSettings: NotificationSettings = {};

  for (const [eventKey, rawSetting] of Object.entries(obj)) {
    if (!VALID_EVENTS.has(eventKey)) {
      return { ok: false, error: `เหตุการณ์ไม่ถูกต้อง: ${eventKey}` };
    }
    if (typeof rawSetting !== "object" || rawSetting === null || Array.isArray(rawSetting)) {
      return { ok: false, error: `ค่าของ ${eventKey} ต้องเป็นออบเจกต์` };
    }
    const setting = rawSetting as Record<string, unknown>;

    for (const [k, v] of Object.entries(setting)) {
      if (!ALLOWED_KEYS.has(k)) {
        return { ok: false, error: `คีย์ไม่ถูกต้องใน ${eventKey}: ${k}` };
      }
      if ((BOOL_KEYS as readonly string[]).includes(k) && typeof v !== "boolean") {
        return { ok: false, error: `${eventKey}.${k} ต้องเป็น boolean` };
      }
      if ((TEXT_KEYS as readonly string[]).includes(k) && v !== null && typeof v !== "string") {
        return { ok: false, error: `${eventKey}.${k} ต้องเป็นข้อความหรือ null` };
      }
    }

    if (typeof setting.title === "string" && setting.title.length > MAX_TITLE) {
      return { ok: false, error: `หัวข้อของ ${eventKey} ยาวเกิน ${MAX_TITLE} ตัวอักษร` };
    }
    if (typeof setting.body === "string" && setting.body.length > MAX_BODY) {
      return { ok: false, error: `เนื้อหาของ ${eventKey} ยาวเกิน ${MAX_BODY} ตัวอักษร` };
    }

    copiedSettings[eventKey] = { ...setting } as EventSetting;
  }

  return { ok: true, value: copiedSettings };
}
