import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — LSL" },
      { name: "description", content: "Manage your LSL profile, contact details, avatar, and gang affiliation." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, profile, refresh } = useAuth();
  const [f, setF] = useState({ full_name: "", phone: "", discord_username: "", country: "", gang_name: "" });
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [busy, setBusy] = useState<"email" | "pw" | null>(null);
  useEffect(() => { if (profile) setF({ full_name: profile.full_name, phone: profile.phone ?? "", discord_username: profile.discord_username ?? "", country: profile.country ?? "", gang_name: profile.gang_name ?? "" }); }, [profile?.id]);
  useEffect(() => { if (user?.email) setEmail(user.email); }, [user?.email]);
  if (!user || !profile) return <Layout><div className="container mx-auto p-10">Sign in</div></Layout>;
  const save = async () => {
    const { error } = await supabase.from("profiles").update(f).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Saved"); await refresh();
  };
  const saveEmail = async () => {
    if (!email.trim() || email.trim() === user.email) return toast.error("Enter a new email address");
    setBusy("email");
    const { error } = await supabase.auth.updateUser({ email: email.trim() });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Confirmation sent", { description: "Check both your old and new inbox to confirm the change." });
  };
  const savePassword = async () => {
    if (pw.next.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw.next !== pw.confirm) return toast.error("Passwords do not match");
    setBusy("pw");
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    setBusy(null);
    if (error) return toast.error(error.message);
    setPw({ next: "", confirm: "" });
    toast.success("Password updated");
  };
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-primary mb-6">Your Profile</h1>
        <Card className="p-5 mb-6 border-primary/30 bg-gradient-to-r from-primary/10 to-accent/5">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Your Special ID</div>
          <div className="mt-1 flex items-center gap-3 flex-wrap">
            <span className="font-mono text-2xl font-black tracking-[0.2em] text-primary">{(profile as any).special_id ?? "—"}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { navigator.clipboard?.writeText((profile as any).special_id ?? ""); toast.success("Special ID copied"); }}
            >Copy</Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Share this ID so others can transfer tokens to you.</p>
        </Card>
        <Card className="p-6 space-y-4">
          {(["full_name","phone","discord_username","country","gang_name"] as const).map((k) => (
            <div key={k}><Label className="capitalize">{k.replace("_"," ")}</Label><Input value={(f as any)[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} /></div>
          ))}
          <Button onClick={save} className="w-full">Save</Button>
        </Card>

        <Card className="p-6 space-y-4 mt-6">
          <h2 className="text-lg font-bold text-primary">Email address</h2>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <p className="text-xs text-muted-foreground mt-1">Changing your email requires confirming via a link sent to the new address.</p>
          </div>
          <Button onClick={saveEmail} disabled={busy === "email"} className="w-full" variant="outline">{busy === "email" ? "Sending…" : "Update email"}</Button>
        </Card>

        <Card className="p-6 space-y-4 mt-6">
          <h2 className="text-lg font-bold text-primary">Reset password</h2>
          <div><Label>New password</Label><Input type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} placeholder="At least 6 characters" /></div>
          <div><Label>Confirm new password</Label><Input type="password" value={pw.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} placeholder="Re-enter new password" /></div>
          <Button onClick={savePassword} disabled={busy === "pw"} className="w-full" variant="outline">{busy === "pw" ? "Updating…" : "Update password"}</Button>
        </Card>
      </div>
    </Layout>
  );
}
