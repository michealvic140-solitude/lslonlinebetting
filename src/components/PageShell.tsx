import { ReactNode } from "react";
import ecbLogo from "@/assets/ecb-logo.png.asset.json";

type Props = { children: ReactNode; className?: string; tone?: "default" | "wallet" | "social" };

/**
 * Themed wrapper that gives any user-facing page the same
 * gold-brown + emerald glassmorphism + animated aurora + ECB logo
 * watermark used on the admin console.
 */
export function PageShell({ children, className = "", tone = "default" }: Props) {
  return (
    <div className={`page-shell page-shell--${tone} ${className}`}>
      <div className="page-shell-aurora" aria-hidden />
      <div
        className="page-shell-logo"
        aria-hidden
        style={{ backgroundImage: `url(${ecbLogo.url})` }}
      />
      <div className="page-shell-content">{children}</div>
    </div>
  );
}
