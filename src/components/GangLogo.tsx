import { cn } from "@/lib/utils";
import ecbLogo from "@/assets/ecb-logo.png.asset.json";
const logoUrl = ecbLogo.url;

/**
 * Official ECB platform logo. Renders the uploaded crest image with optional
 * radial glow halo. Use `withGlow={false}` for inline / footer usage.
 */
export function GangLogo({ className, size = 32, withGlow = true }: { className?: string; size?: number; withGlow?: boolean }) {
  return (
    <span
      className={cn("relative inline-grid place-items-center shrink-0", className)}
      style={{ width: size, height: size }}
      aria-label="E-Football Competition Bet"
    >
      {withGlow && (
        <span
          className="absolute inset-[-25%] rounded-full blur-2xl opacity-70 animate-pulse-glow pointer-events-none"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.65 0.17 158 / 0.55), oklch(0.82 0.17 90 / 0.30) 55%, transparent 80%)",
          }}
        />
      )}
      <img
        src={logoUrl}
        alt="ECB — E-Football Competition Bet"
        width={size}
        height={size}
        className="relative h-full w-full object-contain rounded-full"
        style={{ filter: "drop-shadow(0 2px 6px oklch(0 0 0 / 0.6))" }}
      />
    </span>
  );
}
