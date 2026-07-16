import type { ReactNode } from "react";

/**
 * แบนเนอร์หัวหน้าแบบ gradient (ม่วง→เทอร์คอย→เขียว) ตามแบบ Claude Design
 * ใช้คู่กับ container เนื้อหาที่มี -mt-6 เพื่อให้การ์ดแรกซ้อนขึ้นมาบนแบนเนอร์
 * width ต้องเป็น max-w-* เดียวกับ container เนื้อหาของหน้านั้น
 */
export function PageHero({
  title,
  subtitle,
  width = "max-w-3xl",
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  width?: string;
  children?: ReactNode;
}) {
  return (
    <div className="bg-grad-hero relative overflow-hidden px-6 pb-12 pt-8">
      <div className="hero-glow pointer-events-none absolute inset-0" />
      <div className={`relative mx-auto ${width}`}>
        <h1 className="text-3xl font-extrabold tracking-tight text-text-on-primary">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1.5 text-md text-text-on-hero-muted">{subtitle}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** หัวข้อ section ในการ์ด — มีแท่ง gradient นำหน้าตามแบบ Claude Design */
export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2.5 text-lg font-extrabold text-text-primary">
      <span className="section-bar" aria-hidden="true" />
      {children}
    </h2>
  );
}
