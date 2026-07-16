// Faculty logo + wordmark. Uses the official full-color raster logo
// (public/logo-fms.webp, transparent) at both sizes — keeps the real colors
// (the SVG trace was monochrome). 700px source stays crisp at 30/64px incl.
// retina. Plain <img> — repo does not use next/image.
const IMG: Record<"sm" | "lg", { px: number; cls: string }> = {
  sm: { px: 30, cls: "h-[30px] w-[30px]" },
  lg: { px: 64, cls: "h-16 w-16" },
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
        src="/logo-fms.webp"
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
