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
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "format-detection", content: "telephone=no" },
      { name: "theme-color", content: "#0b0a14" },
      { title: "LOMITA SHOOTERS LEAGUE LSL" },
      { name: "description", content: "Lomita Shooters League: live virtual matches, gang leaderboards, and risk-free token wagering. Join the circuit and back your gang." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "LOMITA SHOOTERS LEAGUE LSL" },
      { property: "og:description", content: "Lomita Shooters League: live virtual matches, gang leaderboards, and risk-free token wagering. Join the circuit and back your gang." },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Lomita Shooters League" },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "LOMITA SHOOTERS LEAGUE LSL" },
      { name: "twitter:description", content: "Lomita Shooters League: live virtual matches, gang leaderboards, and risk-free token wagering. Join the circuit and back your gang." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/HuUiciajAWaV0GW0X0tOTWI0HJb2/social-images/social-1778551416365-357075.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/HuUiciajAWaV0GW0X0tOTWI0HJb2/social-images/social-1778551416365-357075.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon.svg" },
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
              name: "Lomita Shooters League",
              alternateName: "LSL",
              url: "https://lslonlinebetting.lovable.app/",
              logo: "https://lslonlinebetting.lovable.app/icon.svg",
            },
            {
              "@type": "WebSite",
              "@id": "https://lslonlinebetting.lovable.app/#website",
              url: "https://lslonlinebetting.lovable.app/",
              name: "Lomita Shooters League",
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
import { BetSlipFab } from "@/components/BetSlip";
import { RouteProgress } from "@/components/RouteProgress";

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  // PWA: register the service worker in production only (skip iframes/preview)
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    const isIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
    const isPreview = /id-preview--|lovableproject\.com/.test(window.location.hostname);
    if (!isIframe && !isPreview) {
      navigator.serviceWorker.getRegistration("/sw.js").then((r) => { if (!r) navigator.serviceWorker.register("/sw.js").catch(() => {}); });
    } else {
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    }
  }
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BetSlipProvider>
          <ConfirmProvider>
            <MaintenanceGate>
              <Outlet />
            </MaintenanceGate>
            <BanGate />
            <PopupAd />
            <BetSlipFab />
            <RouteProgress />
            <Toaster />
          </ConfirmProvider>
        </BetSlipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
