import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { teamColor } from "@/lib/queries";

export const Route = createFileRoute("/gangs")({
  head: () => ({
    meta: [
      { title: "Gangs — ECB" },
      { name: "description", content: "Explore the gangs and factions of the E-Football Competition Bet, ranked by tokens and members." },
      { property: "og:title", content: "Gangs — ECB" },
      { property: "og:description", content: "Explore the gangs and factions of the E-Football Competition Bet." },
      { property: "og:url", content: "/gangs" },
    ],
    links: [{ rel: "canonical", href: "/gangs" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Gangs of ECB",
          url: "/gangs",
          description: "Directory of gangs and factions of the E-Football Competition Bet.",
        }),
      },
    ],
  }),
  component: GangsPage,
});

function GangsPage() {
  const [gangs, setGangs] = useState<{ name: string; type: string | null; members: number; tokens: number; sample: string[] }[]>([]);

  useEffect(() => {
    supabase.rpc("gang_directory").then(({ data }) => {
      const rows = (data ?? []).map((g: any) => ({
        name: g.name,
        type: g.type,
        members: Number(g.members ?? 0),
        tokens: Number(g.tokens ?? 0),
        sample: (g.sample ?? []) as string[],
      }));
      setGangs(rows.sort((a, b) => b.tokens - a.tokens));
    });
  }, []);

  return (
    <Layout>
      <div className="container py-10">
        <h1 className="text-4xl font-bold gradient-gold-text">Gangs of ECB</h1>
        <p className="text-muted-foreground mt-2">Factions registered in the league. Found a new one when you join.</p>
        {gangs.length === 0 && <Card className="glass p-6 mt-6 text-muted-foreground text-sm">No gangs yet — be the first to register one when you sign up.</Card>}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 mt-8">
          {gangs.map((g) => (
            <Card key={g.name} className="glass p-5 relative overflow-hidden hover:border-primary/60 transition">
              <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full opacity-20 blur-2xl" style={{ background: teamColor(g.name) }} />
              <div className="relative">
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 rounded-lg ring-2 ring-border shrink-0" style={{ background: teamColor(g.name) }} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-lg truncate">{g.name}</h2>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Gang {g.type ?? ""}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-4 text-center">
                  <Stat label="Members" value={g.members.toString()} />
                  <Stat label="Tokens" value={g.tokens.toLocaleString()} />
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1">
                    <Users className="h-3 w-3" />Members
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {g.sample.map((s) => <Badge key={s} variant="outline" className="text-[10px] border-primary/30 text-primary">{s}</Badge>)}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/40 border border-border py-2">
      <div className="font-bold text-primary">{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
    </div>
  );
}
