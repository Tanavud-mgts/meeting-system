import { EditorialCard } from "@/components/ui/EditorialCard";
import { SectionTitle } from "@/components/ui/PageHero";

const STEPS = [
  { label: "ผู้จองส่งคำขอ", sub: "รออนุมัติ" },
  { label: "ผู้ดูแลระบบ", sub: "ขั้นที่ 1" },
  { label: "ผู้อนุมัติ 1", sub: "ขั้นที่ 2" },
  { label: "ผู้อนุมัติ 2", sub: "ขั้นที่ 3" },
  { label: "อนุมัติสำเร็จ", sub: "สร้างในปฏิทิน" },
];

// เส้นทางคำขอผ่านสายอนุมัติ 3 ขั้น (Global chain เดียวทุกห้อง)
export function ApprovalChainDiagram() {
  return (
    <EditorialCard>
      <EditorialCard.Section>
        <SectionTitle>เส้นทางการอนุมัติ</SectionTitle>
      </EditorialCard.Section>
      <EditorialCard.Section>
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-2 md:flex-1 md:flex-col md:gap-1"
            >
              <div className="flex-1 rounded-[2px] border border-border-sunken bg-surface-sunken px-3 py-2 text-center md:w-full">
                <p className="text-sm font-bold text-text-primary">{s.label}</p>
                <p className="font-mono text-xs text-text-secondary">{s.sub}</p>
              </div>
              {i < STEPS.length - 1 ? (
                <span
                  className="flex-none font-bold text-brand-primary"
                  aria-hidden="true"
                >
                  →
                </span>
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-text-secondary">
          หากถูกปฏิเสธที่ขั้นใดขั้นหนึ่ง สายอนุมัติจะสิ้นสุดทันที
          และคำขอจะมีสถานะ “ถูกปฏิเสธ”
        </p>
      </EditorialCard.Section>
    </EditorialCard>
  );
}
