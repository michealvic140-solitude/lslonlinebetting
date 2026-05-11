import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Coins, Upload, Clock, CheckCircle, XCircle, Tag } from "lucide-react";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Buy Tokens — LSL" }, { name: "description", content: "Request tokens to wager in the Lomita Shooters League." }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [amount, setAmount] = useState(500);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!user) { nav({ to: "/login" }); return; }
    refresh();
    const ch = supabase.channel("my-requests")
      .on("postgres_changes", { event: "*", schema: "public", table: "token_requests", filter: `user_id=eq.${user.id}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  async function refresh() {
    if (!user) return;
    const { data } = await supabase.from("token_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setRequests(data ?? []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (amount < 100) { toast.error("Minimum 100 tokens"); return; }
    setSubmitting(true);
    try {
      let proofUrl: string | null = null;
      if (file) {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error: ue } = await supabase.storage.from("token-proofs").upload(path, file);
        if (ue) throw ue;
        proofUrl = supabase.storage.from("token-proofs").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("token_requests").insert({
        user_id: user.id, amount, note, proof_image_url: proofUrl, status: "pending",
      });
      if (error) throw error;
      toast.success("Request submitted. An admin will review it.");
      setAmount(500); setNote(""); setFile(null);
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  if (!user) return null;
  return (
    <Layout>
      <div className="container py-10 max-w-3xl">
        <h1 className="text-3xl font-bold gradient-gold-text flex items-center gap-2"><Coins className="h-6 w-6" />Buy Tokens</h1>
        <p className="text-muted-foreground text-sm mt-1">Submit a request with proof of payment. An admin will credit your account once verified.</p>

        <Card className="glass-strong p-5 mt-6">
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Amount (tokens)</label>
              <Input type="number" min={100} step={100} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Note (transaction reference, payment method, etc.)</label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-muted-foreground">Proof of payment (image)</label>
              <div className="flex items-center gap-2 mt-1">
                <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file && <Badge variant="outline"><Upload className="h-3 w-3 mr-1" />{file.name}</Badge>}
              </div>
            </div>
            <Button className="btn-luxury w-full" disabled={submitting}>{submitting ? "Submitting…" : `Request ${amount} tokens`}</Button>
          </form>
        </Card>

        <PromoRedeem />

        <h2 className="font-bold mt-8 mb-3">My requests</h2>
        <div className="space-y-2">
          {requests.length === 0 && <p className="text-muted-foreground text-sm">No requests yet.</p>}
          {requests.map((r) => (
            <Card key={r.id} className="glass p-3 flex items-center gap-3">
              <StatusIcon s={r.status} />
              <div className="flex-1 min-w-0">
                <div className="font-bold">{r.amount} tokens</div>
                <div className="text-xs text-muted-foreground truncate">{r.note || "—"}</div>
              </div>
              <Badge variant="outline" className="capitalize">{r.status}</Badge>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground mt-8">
          Need help? <Link to="/support" className="text-primary underline">Open a support ticket</Link>.
        </p>
      </div>
    </Layout>
  );
}

function StatusIcon({ s }: { s: string }) {
  if (s === "approved") return <CheckCircle className="h-5 w-5 text-accent" />;
  if (s === "rejected" || s === "denied") return <XCircle className="h-5 w-5 text-destructive" />;
  return <Clock className="h-5 w-5 text-muted-foreground" />;
}

function PromoRedeem() {
  const { user, profile, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function redeem() {
    if (!user || !profile || !code.trim()) return;
    setBusy(true);
    try {
      const c = code.trim().toUpperCase();
      const { data, error } = await supabase.rpc("redeem_promo_code", { _code: c });
      if (error) throw error;
      const amount = (data as any)?.amount ?? 0;
      toast.success(`+${amount.toLocaleString()} tokens credited!`);
      setCode(""); refresh();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <Card className="glass-strong p-5 mt-4 space-y-2">
      <div className="font-bold flex items-center gap-2"><Tag className="h-4 w-4 text-accent" />Redeem promo code</div>
      <div className="flex gap-2">
        <Input placeholder="ENTER CODE" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" />
        <Button className="btn-luxury" disabled={busy || !code.trim()} onClick={redeem}>{busy ? "…" : "Redeem"}</Button>
      </div>
    </Card>
  );
}
