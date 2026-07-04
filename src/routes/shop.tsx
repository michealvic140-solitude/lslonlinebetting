import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShoppingBag, Gift } from "lucide-react";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Rewards Shop — Redeem Your Tokens | LSL" },
      { name: "description", content: "Spend your LSL tokens on exclusive rewards in the Rewards Shop." },
    ],
  }),
  component: ShopPage,
});

function ShopPage() {
  const { user, profile, refresh } = useAuth();
  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [mine, setMine] = useState<any[]>([]);

  async function load() {
    const [{ data: en }, { data: it }] = await Promise.all([
      (supabase as any).from("app_settings").select("shop_enabled").eq("id", 1).maybeSingle(),
      (supabase as any).from("shop_items").select("*").eq("is_active", true).order("cost"),
    ]);
    setEnabled(en?.shop_enabled !== false);
    setItems(it ?? []);
    if (user) {
      const { data: r } = await (supabase as any).from("shop_redemptions").select("*, shop_items(name)").eq("user_id", user.id).order("created_at", { ascending: false });
      setMine(r ?? []);
    }
  }
  useEffect(() => { load(); }, [user?.id]);

  async function redeem(item: any) {
    const { error } = await (supabase.rpc as any)("redeem_shop_item", { _item_id: item.id });
    if (error) return toast.error(error.message);
    toast.success(`Redeemed ${item.name}! Our team will fulfil your order.`);
    refresh(); load();
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-10">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-2xl bg-gradient-gold grid place-items-center shadow-gold"><ShoppingBag className="h-7 w-7 text-background" /></div>
            <div>
              <h1 className="text-3xl font-extrabold gradient-gold-text">Rewards Shop</h1>
              <p className="text-sm text-muted-foreground">Redeem your tokens for exclusive rewards.</p>
            </div>
          </div>
          {user && <Badge variant="outline" className="border-primary/50 text-primary">Balance: {profile?.token_balance?.toLocaleString() ?? 0}</Badge>}
        </div>
        {!enabled && <Card className="p-8 text-center text-muted-foreground">The shop is currently closed.</Card>}
        {enabled && items.length === 0 && <Card className="p-8 text-center text-muted-foreground">No rewards available yet.</Card>}
        {enabled && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((it) => (
              <Card key={it.id} className="overflow-hidden border-primary/20">
                {it.image_url && <img src={it.image_url} alt={it.name} className="h-40 w-full object-cover" loading="lazy" />}
                <div className="p-4 space-y-2">
                  <div className="font-bold">{it.name}</div>
                  {it.description && <p className="text-xs text-muted-foreground line-clamp-2">{it.description}</p>}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-amber-500/50 text-amber-300">{Number(it.cost).toLocaleString()} tokens</Badge>
                    {it.stock !== null && <span className="text-[10px] text-muted-foreground">{it.stock} left</span>}
                  </div>
                  {user ? (
                    <Button className="btn-luxury w-full" onClick={() => redeem(it)} disabled={(it.stock !== null && it.stock <= 0)}>
                      <Gift className="h-4 w-4 mr-1" />{it.stock !== null && it.stock <= 0 ? "Out of stock" : "Redeem"}
                    </Button>
                  ) : <Link to="/login"><Button className="btn-luxury w-full">Sign in to redeem</Button></Link>}
                </div>
              </Card>
            ))}
          </div>
        )}
        {user && mine.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold mb-3">My Redemptions</h2>
            <div className="space-y-2">
              {mine.map((r) => (
                <Card key={r.id} className="p-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">{r.shop_items?.name}</div>
                  <Badge variant="outline" className={r.status === "fulfilled" ? "border-emerald-500/50 text-emerald-300" : "border-primary/50 text-primary"}>{r.status}</Badge>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}