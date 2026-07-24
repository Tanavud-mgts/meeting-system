// สร้างรายการเวลาแบบช่วงละ 30 นาที ตั้งแต่ startHour:00 ถึง endHour:00 (รวมปลายทั้งสอง)
// อ่านค่าชั่วโมงมาจาก system_config เท่านั้น — ห้าม hardcode 8–17
export function buildTimeSlots(startHour: number, endHour: number): string[] {
  const slots: string[] = [];
  for (let m = startHour * 60; m <= endHour * 60; m += 30) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  }
  return slots;
}

// ตัวเลือกเวลาเริ่ม: ทุกช่วงยกเว้นค่าสุดท้าย (เริ่มที่เวลาปิดไม่ได้ เพราะไม่มีช่วงประชุม)
export function startOptions(slots: string[]): string[] {
  return slots.slice(0, -1);
}

// ตัวเลือกเวลาจบ: เฉพาะช่วงที่มากกว่าเวลาเริ่มที่เลือก; ถ้ายังไม่เลือกเริ่มคืนว่าง
export function endOptions(slots: string[], start: string): string[] {
  if (!start) return [];
  return slots.filter((s) => s > start);
}
