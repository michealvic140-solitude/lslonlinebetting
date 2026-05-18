import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Wallet, Sparkles, Clock, CheckCircle, XCircle } from "lucide-react";

export const Route = createFileRoute("/withdraw")({
  head: () => ({ meta: [{ title: "Withdraw Tokens — LSL" }] }),
  component: Page,
});

function Page() {
  const { user, profile, refresh } = useAuth();
  const [ingame, setIngame] = useState("");
  const [gang, setGang] = useState("");
  const [amount, setAmount] = useState<number>(0);
  const [ticketRef, setTicketRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [list, setList] = useState<any[]>([]);
  const [minAmt, setMinAmt] = useState<number>(2000000);

  useEffect(() => {
    if (!user) return;
    setGang(profile?.gang_name ?? "");
    setIngame(profile?.full_name ?? "");
    load();
    supabase.from("app_settings").select("min_withdrawal").eq("id", 1).maybeSingle()
      .then(({ data }) => { if ((data as any)?.min_withdrawal) setMinAmt(Number((data as any).min_withdrawal)); });
    const ch = supabase.channel("my-wd")
      .on("postgres_changes", { event: "*", schema: "public", table: "withdrawal_requests", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function load() {
    if (!user) return;
    const { data } = await supabase.from("withdrawal_requests").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setList(data ?? []);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !profile) return;
    if (!ingame.trim() || !gang.trim()) { toast.error("In-game name and gang are required"); return; }
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (amount < minAmt) { toast.error(`Minimum withdrawal is ${minAmt.toLocaleString()} tokens`); return; }
    if (amount > (profile.token_balance ?? 0)) { toast.error("Amount exceeds balance"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("create_withdrawal_request", {
      _amount: amount, _ingame: ingame.trim(), _gang: gang.trim(), _ticket: ticketRef.trim() || undefined,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setAmount(0); setTicketRef(""); setSuccess(true); refresh();
  }

  if (!user) return <Layout><div className="container py-10"><Link to="/login" className="text-primary underline">Sign in</Link></div></Layout>;

  return (
    <Layout>
      <div className="container py-10 max-w-3xl">
        <div className="flex items-center gap-2 mb-2"><Wallet className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold gradient-gold-text">Withdraw Tokens</h1></div>
        <p className="text-muted-foreground text-sm">Available balance: <span className="font-bold text-primary">{(profile?.token_balance ?? 0).toLocaleString()}</span> tokens</p>

        <Card className="glass-strong p-5 mt-6">
          <form onSubmit={submit} className="space-y-3">
            <Field label="In-game Name *"><Input value={ingame} onChange={(e) => setIngame(e.target.value)} required /></Field>
            <Field label="In-game Gang Name *"><Input value={gang} onChange={(e) => setGang(e.target.value)} required /></Field>
            <Field label={`Withdrawal Amount * (min ${minAmt.toLocaleString()})`}>
              <Input type="number" min={minAmt} max={profile?.token_balance ?? 0} value={amount || ""} onChange={(e) => setAmount(Number(e.target.value))} required />
              <p className="text-[10px] text-muted-foreground mt-1">Minimum withdrawal is {minAmt.toLocaleString()} tokens.</p>
            </Field>
            <Field label="Bet Ticket ID / Tracking ID (optional)"><Input value={ticketRef} onChange={(e) => setTicketRef(e.target.value)} placeholder="LSL-XXXXXXXXXX" /></Field>
            <Button className="btn-luxury w-full" disabled={busy}>{busy ? "Submitting…" : "Submit Withdrawal Request"}</Button>
          </form>
        </Card>

        <h2 className="font-bold mt-8 mb-3">My requests</h2>
        <div className="space-y-2">
          {list.length === 0 && <p className="text-muted-foreground text-sm">No withdrawal requests yet.</p>}
          {list.map((r) => (
            <Card key={r.id} className="glass p-3 flex items-center gap-3 flex-wrap">
              {r.status === "approved" ? <CheckCircle className="h-5 w-5 text-accent" /> : r.status === "declined" ? <XCircle className="h-5 w-5 text-destructive" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
              <div className="flex-1 min-w-0">
                <div className="font-bold">{r.amount.toLocaleString()} tokens</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()} · {r.ingame_name} · {r.gang_name}</div>
                {r.admin_note && <div className="text-xs mt-1 text-muted-foreground italic">"{r.admin_note}"</div>}
              </div>
              <Badge variant="outline" className="capitalize">{r.status}</Badge>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={success} onOpenChange={(v) => !v && setSuccess(false)}>
        <DialogContent className="max-w-lg backdrop-blur-2xl bg-card/70 border-primary/40 rounded-2xl">
          <div className="text-center p-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center mb-4 shadow-lg">
              <Sparkles className="h-8 w-8 text-primary-foreground" />
            </div>
            <h3 className="text-xl font-bold gradient-gold-text mb-2">Request submitted</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Your withdrawal request has been sent and you'll receive it on or before 24hrs after the admin approves it.
              Approval withdrawal request carefully tracked by our support team to avoid inconvenience.
              Stay tuned for notifications from the admin on how to cash out your withdrawal after it's been approved.
            </p>
            <Button className="btn-luxury mt-5 w-full" onClick={() => setSuccess(false)}>Got it</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (<div><label className="text-xs uppercase tracking-widest text-muted-foreground block mb-1">{label}</label>{children}</div>);
}
