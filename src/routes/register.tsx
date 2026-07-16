import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import authHero from "@/assets/efootball-striker.jpg";
import { useBranding } from "@/lib/branding";

function RegisterBrand() {
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

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Join the League — E-Football Competition Bet" },
      { name: "description", content: "Create your free ECB account, pick your gang, claim starter tokens, and start betting on live shooting matches today." },
      { property: "og:title", content: "Join the League — E-Football Competition Bet" },
      { property: "og:description", content: "Create a free account, pick your gang, and start betting on live shooting matches." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/register" },
    ],
    links: [{ rel: "canonical", href: "https://lslonlinebetting.lovable.app/register" }],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const nav = useNavigate();
  const brandingHero = useBranding().authHeroUrl;
  const [f, setF] = useState({
    ingame_name: "",
    discord_full_name: "",
    discord_username: "",
    email: "",
    phone: "",
    password: "",
    confirm_password: "",
    gang_type: "",
    gang_name: "",
    region: "LOMITA AFR",
    referral_code: "",
  });
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted) return toast.error("You must accept the terms");
    if (!f.ingame_name.trim()) return toast.error("In-game full name is required");
    if (!f.discord_full_name.trim()) return toast.error("Discord full name is required");
    if (!f.discord_username.trim()) return toast.error("Discord username is required");
    if (!f.gang_type) return toast.error("Select Faction (F), Gang (G), or E-Football (E)");
    if (!f.gang_name.trim()) {
      const label = f.gang_type === "F" ? "Faction" : f.gang_type === "E" ? "E-Football team" : "Gang";
      return toast.error(`${label} name is required`);
    }
    if (!f.region.trim()) return toast.error("Region is required");
    if (f.password.length < 6) return toast.error("Password must be at least 6 characters");
    if (f.password !== f.confirm_password) return toast.error("Passwords do not match");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: f.email, password: f.password,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: f.ingame_name,
          ingame_name: f.ingame_name,
          discord_full_name: f.discord_full_name,
          discord_username: f.discord_username,
          phone: f.phone,
          region: f.region,
          gang_name: f.gang_name,
          gang_type: f.gang_type,
          referral_code: f.referral_code.trim().toUpperCase() || null,
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created! Check your email to verify.");
    nav({ to: "/login" });
  };

  return (
    <Layout>
      <div className="min-h-[calc(100vh-4rem)] grid grid-cols-1 md:grid-cols-2 bg-background">
        <div className="relative hidden md:block overflow-hidden">
          <img src={brandingHero || authHero} alt="" className="absolute inset-0 h-full w-full object-cover" loading="eager" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-background" />
          <div className="relative z-10 h-full flex flex-col justify-between p-10">
            <div className="flex items-center gap-3">
              <RegisterBrand />
            </div>
            <div className="max-w-sm">
              <h2 className="font-display text-4xl font-black leading-tight">
                Private. <span className="gradient-gold-text">Premium.</span> Yours.
              </h2>
              <p className="text-sm text-muted-foreground mt-3">
                Pick your gang, claim starter tokens, and step into the shootouts. Built for the discerning bettor.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center p-6 sm:p-10 overflow-y-auto">
        <div className="w-full max-w-xl">
          <div className="mb-6">
            <h1 className="font-display text-4xl font-black gradient-gold-text">Open an account</h1>
            <p className="text-sm text-muted-foreground mt-1">Pick your gang. Earn your tokens.</p>
          </div>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><Label>In-game full name *</Label><Input required maxLength={80} value={f.ingame_name} onChange={(e) => set("ingame_name", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Discord full name *</Label><Input required maxLength={80} value={f.discord_full_name} onChange={(e) => set("discord_full_name", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Discord username *</Label><Input required maxLength={60} placeholder="e.g. yourname" value={f.discord_username} onChange={(e) => set("discord_username", e.target.value)} /></div>
            <div><Label>Email *</Label><Input type="email" required maxLength={255} value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>Phone *</Label><Input required type="tel" maxLength={32} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div><Label>Password *</Label><Input type="password" required minLength={6} value={f.password} onChange={(e) => set("password", e.target.value)} /></div>
            <div><Label>Confirm password *</Label><Input type="password" required minLength={6} value={f.confirm_password} onChange={(e) => set("confirm_password", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Faction, Gang or E-Football *</Label>
              <Select value={f.gang_type} onValueChange={(v) => set("gang_type", v)}>
                <SelectTrigger><SelectValue placeholder="Select F (Faction), G (Gang) or E (E-Football)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="F">F — Faction</SelectItem>
                  <SelectItem value="G">G — Gang</SelectItem>
                  <SelectItem value="E">E — E-Football</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.gang_type && (
              <div className="md:col-span-2">
                <Label>
                  {f.gang_type === "F" ? "Faction name" : f.gang_type === "E" ? "E-Football team name" : "Gang name"} *
                </Label>
                <Input
                  required
                  maxLength={60}
                  placeholder={
                    f.gang_type === "F"
                      ? "Enter your faction name"
                      : f.gang_type === "E"
                        ? "Enter your E-Football team name (e.g. Barcelona FC)"
                        : "Enter your gang name"
                  }
                  value={f.gang_name}
                  onChange={(e) => set("gang_name", e.target.value)}
                />
                {f.gang_type === "E" && (
                  <p className="text-[11px] text-muted-foreground mt-1">This is your E-Football club name — enter it exactly as it appears in-game.</p>
                )}
              </div>
            )}
            <div className="md:col-span-2"><Label>Region *</Label><Input required maxLength={60} value={f.region} onChange={(e) => set("region", e.target.value)} placeholder="e.g. LOMITA AFR" /></div>
            <div className="md:col-span-2">
              <Label>Referral code <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                maxLength={32}
                placeholder="ECB-XXXXXX"
                value={f.referral_code}
                onChange={(e) => set("referral_code", e.target.value.toUpperCase())}
                className="font-mono uppercase"
              />
              <p className="text-[11px] text-muted-foreground mt-1">Got a code from another shooter? Enter it once to claim bonus tokens.</p>
            </div>
            <div className="md:col-span-2 flex items-start gap-2 text-sm">
              <Checkbox id="terms" checked={accepted} onCheckedChange={(v) => setAccepted(!!v)} />
              <label htmlFor="terms" className="text-muted-foreground">I accept the platform terms. Virtual tokens only — not real money.</label>
            </div>
            <Button type="submit" disabled={loading} className="md:col-span-2 w-full">{loading ? "Creating..." : "Create Account"}</Button>
          </form>
          <p className="mt-4 text-sm text-center">Already a member? <Link to="/login" className="text-primary hover:underline">Sign in</Link></p>
        </div>
        </div>
      </div>
    </Layout>
  );
}
