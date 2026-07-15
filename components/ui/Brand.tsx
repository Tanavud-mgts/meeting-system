// Faculty logo + wordmark. Logo file is public/logo-fms.svg (placeholder in
// repo; overwrite with official artwork at the same path). Plain <img> — repo
// does not use next/image.
const IMG_SIZE: Record<"sm" | "lg", string> = {
  sm: "h-[30px] w-[30px]",
  lg: "h-16 w-16",
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
        src="/logo-fms.svg"
        alt="ตราคณะวิทยาการจัดการ"
        className={`${IMG_SIZE[size]} flex-none`}
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
