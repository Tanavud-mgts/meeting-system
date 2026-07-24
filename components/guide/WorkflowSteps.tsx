import Link from "next/link";
import type { GuideSection } from "@/lib/guide/content";
import { EditorialCard } from "@/components/ui/EditorialCard";
import { SectionTitle } from "@/components/ui/PageHero";

// การ์ด workflow หนึ่ง section: หัวข้อ + step ที่มีหมายเลขลำดับ และลิงก์ไปหน้าจริง
export function WorkflowSteps({ section }: { section: GuideSection }) {
  return (
    <EditorialCard>
      <EditorialCard.Section>
        <SectionTitle>{section.title}</SectionTitle>
      </EditorialCard.Section>
      {section.steps.map((step, i) => (
        <EditorialCard.Section key={i}>
          <div className="flex gap-3">
            <span
              className="bg-grad-brand shadow-brand mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-[2px] font-mono text-sm font-bold text-text-on-primary"
              aria-hidden="true"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-bold text-text-primary">{step.title}</p>
              <p className="mt-0.5 text-sm text-text-secondary">
                {step.description}
              </p>
              {step.href ? (
                <Link
                  href={step.href}
                  className="mt-2 inline-block text-sm font-bold text-brand-primary hover:underline"
                >
                  {step.linkLabel ?? "ไปหน้าที่เกี่ยวข้อง"} →
                </Link>
              ) : null}
            </div>
          </div>
        </EditorialCard.Section>
      ))}
    </EditorialCard>
  );
}
