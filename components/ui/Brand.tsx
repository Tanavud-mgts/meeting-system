// Faculty logo + wordmark. Two assets, chosen by size:
//   sm → /logo-fms-mark.svg  — simplified wheel mark, NO text ring (legible at
//        30px in the sidebar; a detailed seal turns to mush that small).
//   lg → /logo-fms.svg       — full crest placeholder; replace with the
//        official artwork (drop public/logo-fms.png and switch this to it).
// Plain <img> — repo does not use next/image.
const IMG: Record<"sm" | "lg", { src: string; px: number; cls: string }> = {
  sm: { src: "/logo-fms-mark.svg", px: 30, cls: "h-[30px] w-[30px]" },
  lg: { src: "/logo-fms.svg", px: 64, cls: "h-16 w-16" },
};

export function Brand({
  size = "sm",
  showWordmark = true,
  className = "",
}: {
  size?: "sm" | "lg";
  showWordmark?: boolean;
  className?: string;
}) {
  const stacked = size === "lg";
  return (
    <div
      className={`flex ${stacked ? "flex-col items-center text-center gap-2" : "flex-row items-center gap-2"} ${className}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={IMG[size].src}
        alt="ตราคณะวิทยาการจัดการ"
        width={IMG[size].px}
        height={IMG[size].px}
        className={`${IMG[size].cls} flex-none`}
      />
      {showWordmark && (
        <div className={stacked ? "" : "min-w-0"}>
          <p
            className={`font-extrabold leading-snug text-text-primary ${stacked ? "text-lg" : "text-base"}`}
          >
            ระบบจองห้องประชุม
          </p>
          <p className="text-xs text-text-secondary leading-snug">
            คณะวิทยาการจัดการ มหาวิทยาลัยราชภัฏลำปาง
          </p>
        </div>
      )}
    </div>
  );
}
