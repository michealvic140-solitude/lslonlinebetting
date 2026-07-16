import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Receipt, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Transaction Records — ECB" },
      { name: "description", content: "Every token credit and debit on your ECB account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TransactionsPage,
});

function TransactionsPage() {
  const { user } = useAuth();
  const [txns, setTxns] = useState<any[]>([]);
  const [filter, setFilter] = useState<"all" | "credit" | "debit">("all");

  useEffect(() => {
    if (!user) return;
    const load = () => supabase.from("token_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setTxns(data ?? []));
    load();
    const ch = supabase.channel(`txns-page-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "token_transactions", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  if (!user) return <Layout><div className="container mx-auto px-4 py-16 text-center"><p>Please <Link to="/login" className="text-primary underline">sign in</Link>.</p></div></Layout>;

  const filtered = txns.filter((t) => filter === "all" || (filter === "credit" ? t.amount > 0 : t.amount < 0));

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link to="/dashboard" className="text-muted-foreground text-sm flex items-center gap-1 hover:text-primary mb-3"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
        <div className="mb-6">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Your ledger</p>
          <h1 className="text-3xl md:text-4xl font-extrabold gradient-gold-text flex items-center gap-2 mt-1"><Receipt className="h-7 w-7 text-primary" />Transaction Records</h1>
          <p className="text-sm text-muted-foreground mt-1">Every token credit and debit on your account.</p>
        </div>

        <div className="flex gap-2 mb-4">
          {[{ k: "all", l: "All" }, { k: "credit", l: "Credits" }, { k: "debit", l: "Debits" }].map((f) => (
            <button key={f.k} onClick={() => setFilter(f.k as any)} className={`text-xs font-semibold rounded-full px-3 py-1.5 border transition ${filter === f.k ? "bg-primary/20 border-primary/60 text-primary" : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"}`}>{f.l}</button>
          ))}
        </div>
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-sm text-muted-foreground">No transactions yet.</p>}
          {filtered.map((t) => (
            <Card key={t.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-sm capitalize">{String(t.kind).replace(/_/g, " ")}</div>
                  {t.description && <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>}
                  <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(t.created_at).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${t.amount >= 0 ? "text-emerald-300" : "text-destructive"}`}>{t.amount >= 0 ? "+" : ""}{Number(t.amount).toLocaleString()}</div>
                  <div className="text-[10px] text-muted-foreground">bal {Number(t.balance_after).toLocaleString()}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
