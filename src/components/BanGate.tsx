import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ShieldAlert, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";

export function BanGate() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!profile?.is_banned) return null;

  const submit = async () => {
    if (!msg.trim()) return;
    setSending(true);
    const { error } = await supabase.from("ban_appeals").insert({ user_id: profile.id, message: msg });
    setSending(false);
    if (error) toast.error(error.message);
    else { setSent(true); toast.success("Appeal submitted"); }
  };

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center p-4 bg-background/80 backdrop-blur-xl">
      <Card className="glass-strong max-w-lg w-full p-6 border-destructive/40">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-full bg-destructive/20 grid place-items-center">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-destructive">Account Banned</div>
            <div className="text-lg font-bold">Your access has been suspended</div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          <span className="font-bold text-foreground">Reason: </span>
          {profile.ban_reason || "Violation of league rules."}
        </p>
        {sent ? (
          <div className="rounded-md bg-primary/10 border border-primary/30 p-3 text-sm">
            Your appeal has been received. The league will review it shortly.
          </div>
        ) : (
          <>
            <Textarea
              placeholder="Submit an appeal — explain your situation…"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              rows={4}
            />
            <div className="flex gap-2 mt-3">
              <Button className="btn-luxury flex-1" disabled={sending || !msg.trim()} onClick={submit}>
                {sending ? "Sending…" : "Submit appeal"}
              </Button>
              <Button variant="outline" onClick={async () => { await signOut(); nav({ to: "/" }); }}>
                <LogOut className="h-4 w-4 mr-1" />Logout
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
