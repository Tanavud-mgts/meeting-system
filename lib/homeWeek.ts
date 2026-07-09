// Pure date helpers สำหรับแถบ "สัปดาห์นี้" ในหน้า /home
// สัปดาห์เริ่มวันอาทิตย์ตามปฏิทินไทย ไม่พึ่ง React/Supabase เพื่อ unit-test ได้

export const THAI_WEEKDAY_LABELS = [
  "อา",
  "จ",
  "อ",
  "พ",
  "พฤ",
  "ศ",
  "ส",
] as const;

export type WeekDay = {
  date: Date; // เที่ยงคืน (local) ของวันนั้น
  label: string;
  dayOfMonth: number;
  isToday: boolean;
  count: number;
};

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfWeek(now: Date): Date {
  const d = startOfDay(now);
  d.setDate(d.getDate() - d.getDay()); // ย้อนไปวันอาทิตย์
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function buildWeekDays(now: Date): WeekDay[] {
  const start = startOfWeek(now);
  const today = startOfDay(now);
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i
    );
    days.push({
      date,
      label: THAI_WEEKDAY_LABELS[date.getDay()],
      dayOfMonth: date.getDate(),
      isToday: isSameDay(date, today),
      count: 0,
    });
  }
  return days;
}

export function weekRangeISO(now: Date): { startISO: string; endISO: string } {
  const start = startOfWeek(now);
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 7
  );
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function bucketByDay(
  days: WeekDay[],
  bookings: { start_time: string }[]
): WeekDay[] {
  const result = days.map((d) => ({ ...d, count: 0 }));
  if (result.length === 0) return result;
  const weekStart = startOfDay(result[0].date);
  for (const b of bookings) {
    const bDay = startOfDay(new Date(b.start_time));
    const diffDays = Math.round(
      (bDay.getTime() - weekStart.getTime()) / 86400000
    );
    if (diffDays >= 0 && diffDays < 7) {
      result[diffDays].count += 1;
    }
  }
  return result;
}
