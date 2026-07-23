import { EditorialCard } from "@/components/ui/EditorialCard";
import { SectionTitle } from "@/components/ui/PageHero";
import { StatusMarker } from "@/components/ui/StatusMarker";

type Tone = "success" | "warning" | "danger" | "neutral";

const STATUSES: { label: string; tone: Tone; meaning: string }[] = [
  { label: "รออนุมัติ", tone: "warning", meaning: "รอผู้ดูแลระบบพิจารณาเป็นขั้นแรก" },
  { label: "อนุมัติแล้ว", tone: "success", meaning: "ผ่านครบทุกขั้นของสายอนุมัติ" },
  { label: "ถูกปฏิเสธ", tone: "danger", meaning: "ถูกปฏิเสธระหว่างสายอนุมัติ" },
  { label: "ยกเลิกแล้ว", tone: "neutral", meaning: "ผู้จองยกเลิกเองขณะยังรออนุมัติ" },
  {
    label: "รอยกเลิก",
    tone: "warning",
    meaning: "ขอยกเลิกหลังอนุมัติแล้ว รอผู้ดูแลระบบพิจารณา",
  },
  {
    label: "ยกเลิกโดยผู้ดูแล",
    tone: "neutral",
    meaning: "ผู้ดูแลระบบหรือผู้อนุมัติยกเลิกโดยตรง",
  },
];

// อภิธานสถานะการจอง — แสดงครั้งเดียวท้ายหน้า
export function StatusLegend() {
  return (
    <EditorialCard>
      <EditorialCard.Section>
        <SectionTitle>ความหมายของสถานะการจอง</SectionTitle>
      </EditorialCard.Section>
      {STATUSES.map((s, i) => (
        <EditorialCard.Section key={i}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <span className="sm:w-44 sm:flex-none">
              <StatusMarker tone={s.tone}>{s.label}</StatusMarker>
            </span>
            <span className="text-sm text-text-secondary">{s.meaning}</span>
          </div>
        </EditorialCard.Section>
      ))}
    </EditorialCard>
  );
}
