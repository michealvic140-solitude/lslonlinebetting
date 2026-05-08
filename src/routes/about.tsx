import { createFileRoute } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Crosshair, Shield, Coins, Users } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — Lomita Shooters League" },
      { name: "description", content: "What the Lomita Shooters League is, how virtual tokens work, and our community standards." },
      { property: "og:title", content: "About LSL" },
      { property: "og:description", content: "Virtual-token competitive shooting. No real money gambling." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <Layout>
      <div className="container py-10 max-w-4xl">
        <h1 className="text-4xl font-bold gradient-gold-text">About the League</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          The Lomita Shooters League (LSL) is a competitive virtual-token shooting circuit. Members form gangs, compete in scheduled and live matches, and place token-only wagers on outcomes. There is no real-money gambling.
        </p>

        <div className="grid md:grid-cols-2 gap-4 mt-8">
          {[
            { icon: Crosshair, title: "Competition", body: "Weekly matches across six factions. Live odds reflect real round-by-round momentum." },
            { icon: Coins, title: "Virtual Tokens", body: "All wagers use league-issued virtual tokens. Tokens have no cash value." },
            { icon: Users, title: "Gang Structure", body: "Captains, Veterans, Shooters and Rookies — each role earns standing through play." },
            { icon: Shield, title: "Fair Play", body: "Markets close once a round is in motion. Admins audit suspicious wagering patterns." },
          ].map((c) => (
            <Card key={c.title} className="glass p-5">
              <c.icon className="h-6 w-6 text-gold" />
              <h3 className="font-bold mt-3">{c.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{c.body}</p>
            </Card>
          ))}
        </div>

        <Card className="glass-strong mt-8 p-6 border-[var(--emerald)]/30">
          <h3 className="font-bold">A note on responsibility</h3>
          <p className="text-sm text-muted-foreground mt-2">
            LSL is designed for entertainment. Tokens are not redeemable for cash and may not be transferred outside the platform. If wagering — even with virtual tokens — stops feeling fun, take a break.
          </p>
        </Card>
      </div>
    </Layout>
  );
}
