import { cn } from "@/lib/utils";

/**
 * LSL gang emblem — skull centered between two crossed pistols on a gothic shield,
 * banner ribbon with "LSL", gold + emerald palette, slow rotating outer ring.
 * Inspired by classic outlaw / biker / militia gang insignia.
 */
export function GangLogo({ className, size = 32, withGlow = true }: { className?: string; size?: number; withGlow?: boolean }) {
  return (
    <span className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }} aria-hidden>
      {withGlow && (
        <span
          className="absolute inset-[-30%] rounded-full blur-xl opacity-70 animate-pulse-glow pointer-events-none"
          style={{ background: "radial-gradient(closest-side, oklch(0.82 0.17 90 / 0.6), oklch(0.65 0.17 158 / 0.35) 50%, transparent 75%)" }}
        />
      )}
      {/* Slowly rotating outer ring with bullets */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 animate-slow-spin" style={{ filter: "drop-shadow(0 0 6px oklch(0.82 0.17 90 / 0.45))" }}>
        <defs>
          <linearGradient id="lslRing" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.82 0.17 90)" />
            <stop offset="50%" stopColor="oklch(0.65 0.17 158)" />
            <stop offset="100%" stopColor="oklch(0.62 0.14 80)" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="47" fill="none" stroke="url(#lslRing)" strokeWidth="1.6" strokeDasharray="2 5" />
        {/* Bullet studs */}
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <circle key={deg} cx={50 + 47 * Math.cos((deg * Math.PI) / 180)} cy={50 + 47 * Math.sin((deg * Math.PI) / 180)} r="1.6" fill="url(#lslRing)" />
        ))}
      </svg>
      {/* Static shield + crossed pistols + skull */}
      <svg viewBox="0 0 100 100" className="relative">
        <defs>
          <linearGradient id="lslShield" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.20 0.06 165)" />
            <stop offset="60%" stopColor="oklch(0.10 0.03 270)" />
            <stop offset="100%" stopColor="oklch(0.06 0.02 270)" />
          </linearGradient>
          <linearGradient id="lslGold" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.95 0.12 92)" />
            <stop offset="50%" stopColor="oklch(0.82 0.17 90)" />
            <stop offset="100%" stopColor="oklch(0.55 0.13 78)" />
          </linearGradient>
          <linearGradient id="lslEmerald" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.78 0.16 160)" />
            <stop offset="100%" stopColor="oklch(0.55 0.16 158)" />
          </linearGradient>
          <radialGradient id="lslSkull" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="oklch(0.98 0.02 90)" />
            <stop offset="70%" stopColor="oklch(0.82 0.04 90)" />
            <stop offset="100%" stopColor="oklch(0.55 0.04 90)" />
          </radialGradient>
        </defs>
        {/* Crest / shield body */}
        <path
          d="M50 6 L88 20 L86 56 Q84 78 50 94 Q16 78 14 56 L12 20 Z"
          fill="url(#lslShield)"
          stroke="url(#lslGold)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {/* Inner emerald edge */}
        <path
          d="M50 12 L82 24 L80 54 Q78 72 50 86 Q22 72 20 54 L18 24 Z"
          fill="none"
          stroke="url(#lslEmerald)"
          strokeWidth="1"
          opacity="0.55"
        />
        {/* Crossed pistols behind skull */}
        <g stroke="url(#lslGold)" strokeWidth="2.6" strokeLinecap="round" fill="url(#lslGold)">
          {/* pistol 1 — barrel + grip, rotated -38 */}
          <g transform="translate(50 56) rotate(-40)">
            <rect x="-26" y="-2.2" width="34" height="4.4" rx="1" />
            <path d="M2 2 L4 12 L-6 12 L-3 2 Z" />
            <rect x="-25" y="-3.5" width="6" height="1.5" rx="0.6" />
          </g>
          {/* pistol 2 — mirrored */}
          <g transform="translate(50 56) rotate(40) scale(-1 1)">
            <rect x="-26" y="-2.2" width="34" height="4.4" rx="1" />
            <path d="M2 2 L4 12 L-6 12 L-3 2 Z" />
            <rect x="-25" y="-3.5" width="6" height="1.5" rx="0.6" />
          </g>
        </g>
        {/* Skull */}
        <g transform="translate(50 48)">
          <path
            d="M0 -16 C 11 -16 17 -8 17 0 C 17 6 14 9 12 11 L 12 16 L 8 16 L 8 19 L 4 19 L 4 16 L -4 16 L -4 19 L -8 19 L -8 16 L -12 16 L -12 11 C -14 9 -17 6 -17 0 C -17 -8 -11 -16 0 -16 Z"
            fill="url(#lslSkull)"
            stroke="oklch(0.25 0.02 270)"
            strokeWidth="0.8"
          />
          {/* Eye sockets */}
          <ellipse cx="-6" cy="-3" rx="3.6" ry="4" fill="oklch(0.08 0.02 270)" />
          <ellipse cx="6" cy="-3" rx="3.6" ry="4" fill="oklch(0.08 0.02 270)" />
          {/* Glowing emerald pupils */}
          <circle cx="-6" cy="-2.5" r="1.1" fill="oklch(0.85 0.22 152)">
            <animate attributeName="opacity" values="1;0.4;1" dur="2.2s" repeatCount="indefinite" />
          </circle>
          <circle cx="6" cy="-2.5" r="1.1" fill="oklch(0.85 0.22 152)">
            <animate attributeName="opacity" values="1;0.4;1" dur="2.2s" repeatCount="indefinite" />
          </circle>
          {/* Nose */}
          <path d="M0 1 L -1.5 5 L 1.5 5 Z" fill="oklch(0.10 0.02 270)" />
          {/* Teeth */}
          <rect x="-6" y="7" width="12" height="3" fill="oklch(0.95 0.04 90)" stroke="oklch(0.20 0.02 270)" strokeWidth="0.4" />
          <line x1="-3" y1="7" x2="-3" y2="10" stroke="oklch(0.20 0.02 270)" strokeWidth="0.4" />
          <line x1="0" y1="7" x2="0" y2="10" stroke="oklch(0.20 0.02 270)" strokeWidth="0.4" />
          <line x1="3" y1="7" x2="3" y2="10" stroke="oklch(0.20 0.02 270)" strokeWidth="0.4" />
        </g>
        {/* Banner ribbon */}
        <g>
          <path d="M16 74 L 84 74 L 80 82 L 50 86 L 20 82 Z" fill="url(#lslGold)" stroke="oklch(0.30 0.05 80)" strokeWidth="0.6" />
          <text x="50" y="81" textAnchor="middle" fontFamily="Cinzel, serif" fontWeight="900" fontSize="7" fill="oklch(0.12 0.02 270)" letterSpacing="3">
            LSL
          </text>
        </g>
      </svg>
    </span>
  );
}
