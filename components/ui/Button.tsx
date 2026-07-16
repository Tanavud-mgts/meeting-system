import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "success" | "secondary" | "danger" | "dangerSolid";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  // ปุ่มหลัก — gradient ม่วง→เทอร์คอย พร้อมเงาโทน brand
  primary: "bg-grad-brand text-text-on-primary font-bold shadow-brand",
  // ปุ่มยืนยัน/อนุมัติ — gradient เขียว→เทอร์คอย
  success: "bg-grad-success text-text-on-primary font-bold shadow-success",
  secondary:
    "border-[1.5px] border-neutral-300 bg-surface-card font-bold text-text-secondary hover:bg-neutral-50",
  // ปุ่มปฏิเสธแบบพื้นส้มอ่อน (soft) ตามแบบ Claude Design
  danger:
    "border-[1.5px] border-warning-border bg-warning-surface font-bold text-warning-text hover:bg-danger-solid hover:border-danger-solid hover:text-text-on-primary",
  // ปุ่มยืนยันการปฏิเสธใน dialog — gradient แดง→ส้ม
  dangerSolid: "bg-grad-danger text-text-on-primary font-bold",
};

export function Button({
  variant = "primary",
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`rounded-sm px-4 py-2 text-sm transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100 ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
