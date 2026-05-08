import { teamColor } from "@/lib/queries";

export function TeamLogo({ name, url, size = 36, rounded = "md" }: { name?: string | null; url?: string | null; size?: number; rounded?: "md" | "full" }) {
  const cls = rounded === "full" ? "rounded-full" : "rounded-md";
  if (url) {
    return (
      <div className={`${cls} bg-card border border-border overflow-hidden grid place-items-center shrink-0`} style={{ height: size, width: size }}>
        <img src={url} alt={name ?? ""} className="h-full w-full object-contain" loading="lazy" />
      </div>
    );
  }
  const initials = (name ?? "?").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div className={`${cls} grid place-items-center text-primary-foreground font-bold shrink-0`}
         style={{ background: teamColor(name), height: size, width: size, fontSize: Math.max(10, size / 3) }}>
      {initials || "?"}
    </div>
  );
}
