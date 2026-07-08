// Initials avatar (no photo upload yet — Supabase Storage deferred). Derives
// 1–2 initials from a Thai/Latin full name, skipping common Thai titles.

const TITLES = new Set([
  "นาย",
  "นาง",
  "นางสาว",
  "น.ส.",
  "ดร.",
  "ผศ.",
  "รศ.",
  "ศ.",
  "ว่าที่",
]);

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const named = words.filter((w) => !TITLES.has(w));
  const pick = named.length > 0 ? named : words;
  const initials = pick
    .slice(0, 2)
    .map((w) => w.charAt(0))
    .join("");
  return initials || "?";
}

const SIZE_CLASS: Record<"sm" | "md" | "lg", string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
};

export function Avatar({
  name,
  size = "md",
  tone = "solid",
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  // "solid" = brand fill (for light backgrounds / lists);
  // "inverse" = white fill (for the brand-gradient profile header)
  tone?: "solid" | "inverse";
}) {
  const toneClass =
    tone === "inverse"
      ? "bg-surface-card text-brand-primary"
      : "bg-brand-primary text-text-on-primary";

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${SIZE_CLASS[size]} ${toneClass}`}
      aria-hidden="true"
    >
      {getInitials(name)}
    </div>
  );
}
