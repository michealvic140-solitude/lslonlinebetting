import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Gift, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

/**
 * Lets a signed-in user redeem a referral code exactly once.
 * Hides itself if the user has already redeemed one.
 */
export function RedeemReferralCard() {
  const { user } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [alreadyRedeemed, setAlreadyRedeemed] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("referral_redemptions")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setAlreadyRedeemed(!!data);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  async function submit() {
    if (!code.trim()) return toast.error("Enter a referral code");
    setBusy(true);
    const { data, error } = await supabase.rpc("redeem_referral_code" as any, { _code: code.trim() } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    const result = data as any;
    if (!result?.ok) {
      const map: Record<string, string> = {
        already_redeemed: "You've already redeemed a referral code.",
        code_not_found: "Invalid referral code.",
        self_referral: "You can't redeem your own referral code.",
        invalid_code: "Enter a valid code.",
        unauth: "Please sign in.",
      };
      return toast.error(map[result?.error] || result?.error || "Could not redeem code");
    }
    toast.success(`Code redeemed! +${Number(result.referee_bonus).toLocaleString()} tokens credited.`);
    setAlreadyRedeemed(true);
    setCode("");
  }

  if (alreadyRedeemed) return null;

  return (
    <Card className="p-4 backdrop-blur-xl bg-card/60 border-primary/30">
      <div className="flex items-center gap-2 mb-2">
        <Gift className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm">Redeem a Referral Code</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        Got a code from another shooter? Redeem it once to claim your bonus tokens.
      </p>
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="LSL-XXXXXX"
          maxLength={32}
          className="font-mono uppercase"
        />
        <Button onClick={submit} disabled={busy} size="sm" className="btn-luxury">
          {busy ? "…" : <><Check className="h-3.5 w-3.5 mr-1" />Redeem</>}
        </Button>
      </div>
    </Card>
  );
}