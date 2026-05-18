import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Join the League — Lomita Shooters League" },
      { name: "description", content: "Create your free LSL account, pick your gang, claim starter tokens, and start betting on live shooting matches today." },
      { property: "og:title", content: "Join the League — Lomita Shooters League" },
      { property: "og:description", content: "Create a free account, pick your gang, and start betting on live shooting matches." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/register" },
    ],
    links: [{ rel: "canonical", href: "https://lslonlinebetting.lovable.app/register" }],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const nav = useNavigate();
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
    server: "LOMITA AFR",
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
    if (!f.gang_type) return toast.error("Select Faction (F) or Gang (G)");
    if (!f.gang_name.trim()) return toast.error(`${f.gang_type === "F" ? "Faction" : "Gang"} name is required`);
    if (!f.server.trim()) return toast.error("Server is required");
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
          server: f.server,
          gang_name: f.gang_name,
          gang_type: f.gang_type,
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
      <div className="container mx-auto px-4 py-12 max-w-xl">
        <Card className="p-8 backdrop-blur-xl bg-card/60 border-primary/30">
          <h1 className="text-3xl font-bold text-primary mb-1">Join the League</h1>
          <p className="text-sm text-muted-foreground mb-6">Pick your gang. Earn your tokens.</p>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2"><Label>In-game full name *</Label><Input required maxLength={80} value={f.ingame_name} onChange={(e) => set("ingame_name", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Discord full name *</Label><Input required maxLength={80} value={f.discord_full_name} onChange={(e) => set("discord_full_name", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Discord username *</Label><Input required maxLength={60} placeholder="e.g. yourname" value={f.discord_username} onChange={(e) => set("discord_username", e.target.value)} /></div>
            <div><Label>Email *</Label><Input type="email" required maxLength={255} value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div><Label>Phone *</Label><Input required type="tel" maxLength={32} value={f.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div><Label>Password *</Label><Input type="password" required minLength={6} value={f.password} onChange={(e) => set("password", e.target.value)} /></div>
            <div><Label>Confirm password *</Label><Input type="password" required minLength={6} value={f.confirm_password} onChange={(e) => set("confirm_password", e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Faction or Gang *</Label>
              <Select value={f.gang_type} onValueChange={(v) => set("gang_type", v)}>
                <SelectTrigger><SelectValue placeholder="Select F (Faction) or G (Gang)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="F">F — Faction</SelectItem>
                  <SelectItem value="G">G — Gang</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.gang_type && (
              <div className="md:col-span-2">
                <Label>{f.gang_type === "F" ? "Faction name" : "Gang name"} *</Label>
                <Input required maxLength={60} placeholder={`Enter your ${f.gang_type === "F" ? "faction" : "gang"} name`} value={f.gang_name} onChange={(e) => set("gang_name", e.target.value)} />
              </div>
            )}
            <div className="md:col-span-2"><Label>Server *</Label><Input required maxLength={60} value={f.server} onChange={(e) => set("server", e.target.value)} /></div>
            <div className="md:col-span-2 flex items-start gap-2 text-sm">
              <Checkbox id="terms" checked={accepted} onCheckedChange={(v) => setAccepted(!!v)} />
              <label htmlFor="terms" className="text-muted-foreground">I accept the platform terms. Virtual tokens only — not real money.</label>
            </div>
            <Button type="submit" disabled={loading} className="md:col-span-2 w-full">{loading ? "Creating..." : "Create Account"}</Button>
          </form>
          <p className="mt-4 text-sm text-center">Already a member? <Link to="/login" className="text-primary hover:underline">Sign in</Link></p>
        </Card>
      </div>
    </Layout>
  );
}
