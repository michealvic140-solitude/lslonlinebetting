import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { ShieldAlert } from "lucide-react";
import authHero from "@/assets/efootball-striker.jpg";
import { useBranding } from "@/lib/branding";

function AuthBrand() {
  const b = useBranding();
  return (
    <>
      {b.logoAuthUrl ? (
        <img src={b.logoAuthUrl} alt={b.name} className="h-10 w-10 rounded-full object-cover shadow-gold" />
      ) : (
        <div className="h-10 w-10 rounded-full bg-gradient-gold grid place-items-center shadow-gold">
          <span className="font-black text-background">{(b.name || "L").charAt(0)}</span>
        </div>
      )}
      <div className="leading-tight">
        <div className="font-black tracking-wide uppercase">{b.tagline || b.name}</div>
        <div className="text-[10px] uppercase tracking-[0.35em] text-primary/80">{b.name}</div>
      </div>
    </>
  );
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — E-Football Competition Bet" },
      { name: "description", content: "Sign in to your E-Football Competition Bet account to place bets, track your tickets, and follow your gang." },
      { property: "og:title", content: "Sign in — E-Football Competition Bet" },
      { property: "og:description", content: "Sign in to place bets, track tickets, and follow your gang at ECB." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/login" },
    ],
    links: [{ rel: "canonical", href: "https://lslonlinebetting.lovable.app/login" }],
  }),
  validateSearch: (s: Record<string, unknown>): { banned?: number } => {
    return s.banned === "1" || s.banned === 1 ? { banned: 1 } : {};
  },
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { banned } = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const brandingHero = useBranding().authHeroUrl;

  useEffect(() => {
    if (user) nav({ to: "/dashboard", replace: true });
  }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    // Hard navigate to ensure auth state is hydrated everywhere
    window.location.href = "/dashboard";
  };

  return (
    <Layout>
      <div className="min-h-[calc(100vh-4rem)] grid grid-cols-1 md:grid-cols-2 bg-background">
        {/* LEFT — cinematic gangster panel */}
        <div className="relative hidden md:block overflow-hidden">
          <img
            src={brandingHero || authHero}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="eager"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-background" />
          <div className="relative z-10 h-full flex flex-col justify-between p-10">
            <div className="flex items-center gap-3">
              <AuthBrand />
            </div>
            <div className="max-w-sm">
              <h2 className="font-display text-4xl font-black leading-tight">
                Private. <span className="gradient-gold-text">Premium.</span> Yours.
              </h2>
              <p className="text-sm text-muted-foreground mt-3">
                High-stakes shootouts, live gang leagues, and premium virtual arenas — built for the discerning bettor.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT — sign-in card */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            {banned && (
              <Card className="mb-6 p-5 backdrop-blur-2xl bg-destructive/10 border-destructive/40">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-destructive/20 grid place-items-center shrink-0">
                    <ShieldAlert className="h-5 w-5 text-destructive" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-bold text-destructive">Your account has been banned</h2>
                    <p className="text-xs text-muted-foreground mt-1">You can submit an appeal to our moderation team for review.</p>
                    <Link to="/support" className="inline-block mt-3 text-xs px-3 py-1.5 rounded-md bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30 transition">Submit Appeal →</Link>
                  </div>
                </div>
              </Card>
            )}
            <div className="mb-6">
              <h1 className="font-display text-4xl font-black gradient-gold-text">Welcome back</h1>
              <p className="text-sm text-muted-foreground mt-1">Sign in to your dashboard.</p>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-card/60 backdrop-blur-xl border-primary/30" /></div>
              <div><Label>Password</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-card/60 backdrop-blur-xl border-primary/30" /></div>
              <Button type="submit" disabled={loading} className="btn-luxury w-full h-11 text-base font-black">{loading ? "Signing in..." : "Sign in"}</Button>
            </form>
            <div className="mt-6 flex items-center justify-between text-sm">
              <Link to="/forgot-password" className="text-muted-foreground hover:text-primary hover:underline">Forgot password?</Link>
              <span className="text-muted-foreground">
                New here? <Link to="/register" className="text-primary font-bold hover:underline">Open an account</Link>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
