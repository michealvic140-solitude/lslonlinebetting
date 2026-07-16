import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover" },
      { name: "google-site-verification", content: "VmJKgEfwpQsNav2Nc0ItKNySizECxM7nnKuyxh-A5gM" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "format-detection", content: "telephone=no" },
      { name: "theme-color", content: "#0b0a14" },
      { title: "E-Football Competition Bet — Virtual Token Shooting League" },
      { name: "description", content: "Live matches, gang leaderboards and virtual-token wagering for the E-Football Competition Bet." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "E-Football Competition Bet — Virtual Token Shooting League" },
      { property: "og:description", content: "Live matches, gang leaderboards and virtual-token wagering for the E-Football Competition Bet." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "E-Football Competition Bet" },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "E-Football Competition Bet — Virtual Token Shooting League" },
      { name: "twitter:description", content: "Live matches, gang leaderboards and virtual-token wagering for the E-Football Competition Bet." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/0gjeUv09k8V6NsmPR2x9nR6Yzuo1/social-images/social-1784049993438-481821.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/0gjeUv09k8V6NsmPR2x9nR6Yzuo1/social-images/social-1784049993438-481821.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", href: "/icon-512.png?v=ecb2", type: "image/png", sizes: "512x512" },
      { rel: "icon", href: "/icon-192.png?v=ecb2", type: "image/png", sizes: "192x192" },
      { rel: "shortcut icon", href: "/favicon.ico?v=ecb2" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=ecb2", sizes: "180x180" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://lslonlinebetting.lovable.app/#organization",
              name: "E-Football Competition Bet",
              alternateName: "ECB",
              url: "https://lslonlinebetting.lovable.app/",
              logo: "https://lslonlinebetting.lovable.app/icon.svg",
            },
            {
              "@type": "WebSite",
              "@id": "https://lslonlinebetting.lovable.app/#website",
              url: "https://lslonlinebetting.lovable.app/",
              name: "E-Football Competition Bet",
              description: "Live virtual shooting matches, gang leaderboards, and token-only wagering.",
              publisher: { "@id": "https://lslonlinebetting.lovable.app/#organization" },
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

import { AuthProvider } from "@/contexts/AuthContext";
import { BetSlipProvider } from "@/contexts/BetSlipContext";
import { Toaster } from "@/components/ui/sonner";

import { MaintenanceGate } from "@/components/MaintenanceGate";
import { BanGate } from "@/components/BanGate";
import { ConfirmProvider } from "@/components/ConfirmDialog";
import { PopupAd } from "@/components/PopupAd";
import { CookieConsent } from "@/components/CookieConsent";
import { BetSlipFab } from "@/components/BetSlip";
import { RouteProgress } from "@/components/RouteProgress";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { useBranding } from "@/lib/branding";
import { useEffect } from "react";
import { trackPageView } from "@/lib/analytics";

function AnalyticsTracker() {
  const router = useRouter();
  useEffect(() => {
    trackPageView();
    const unsub = router.subscribe("onResolved", () => trackPageView());
    return () => { unsub(); };
  }, [router]);
  return null;
}

function BrandingSync() {
  const b = useBranding();
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (b.name && b.tagline) {
      const t = `${b.tagline} — ${b.name}`;
      if (document.title !== t) document.title = t;
    }
    const setMeta = (sel: string, attr: string, val: string) => {
      const el = document.head.querySelector(sel) as HTMLMetaElement | null;
      if (el) el.setAttribute(attr, val);
    };
    if (b.description) {
      setMeta('meta[name="description"]', "content", b.description);
      setMeta('meta[property="og:description"]', "content", b.description);
      setMeta('meta[name="twitter:description"]', "content", b.description);
    }
    if (b.tagline) {
      setMeta('meta[property="og:title"]', "content", b.tagline);
      setMeta('meta[name="twitter:title"]', "content", b.tagline);
      setMeta('meta[property="og:site_name"]', "content", b.tagline);
    }
    if (b.ogImageUrl) {
      setMeta('meta[property="og:image"]', "content", b.ogImageUrl);
      setMeta('meta[name="twitter:image"]', "content", b.ogImageUrl);
    }
  }, [b.name, b.tagline, b.description, b.ogImageUrl]);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BetSlipProvider>
          <ConfirmProvider>
            <BrandingSync />
            <AnalyticsTracker />
            <MaintenanceGate>
              <Outlet />
            </MaintenanceGate>
            <BanGate />
            <PopupAd />
            <BetSlipFab />
            <RouteProgress />
            <CookieConsent />
            <PushPermissionPrompt />
            <PWAInstallPrompt />
            <Toaster />
          </ConfirmProvider>
        </BetSlipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
