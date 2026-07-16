import { createFileRoute, Link } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Coins, Crosshair, Shield, Trophy, Users, Clock } from "lucide-react";

export const Route = createFileRoute("/guides/how-it-works")({
  head: () => ({
    meta: [
      { title: "How Virtual Sports Betting Works — ECB Guide" },
      {
        name: "description",
        content:
          "Learn how virtual sports betting works on ECB: virtual tokens, match odds, live rounds and settlement — with no real-money gambling.",
      },
      { property: "og:title", content: "How Virtual Sports Betting Works — ECB Guide" },
      {
        property: "og:description",
        content:
          "A beginner's guide to virtual sports betting mechanics: how virtual tokens, odds, and round-by-round settlement work on ECB.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "/guides/how-it-works" },
    ],
    links: [{ rel: "canonical", href: "/guides/how-it-works" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "How Virtual Sports Betting Works",
          description:
            "A beginner's guide to virtual sports betting mechanics on the E-Football Competition Bet.",
          url: "/guides/how-it-works",
          about: "virtual sports betting",
          inLanguage: "en",
        }),
      },
    ],
  }),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  return (
    <Layout>
      <article className="container py-10 max-w-3xl prose prose-invert">
        <h1 className="text-4xl font-bold gradient-gold-text mb-2">How Virtual Sports Betting Works</h1>
        <p className="text-muted-foreground text-lg">
          Virtual sports betting on ECB is a competitive, entertainment-only format. Everything is powered
          by league-issued <strong>virtual tokens</strong> — there is no real-money gambling, no cash-out,
          and no transfer of tokens off the platform.
        </p>

        <div className="grid md:grid-cols-2 gap-4 my-6">
          <Card className="glass p-5">
            <Coins className="h-6 w-6 text-gold" />
            <h2 className="font-bold mt-3">Virtual tokens, not money</h2>
            <p className="text-sm text-muted-foreground mt-1">
              You wager league tokens earned through activity, streaks, and rewards. Tokens have no cash
              value and can't be redeemed or transferred outside ECB.
            </p>
          </Card>
          <Card className="glass p-5">
            <Crosshair className="h-6 w-6 text-gold" />
            <h2 className="font-bold mt-3">How virtual matches run</h2>
            <p className="text-sm text-muted-foreground mt-1">
              A virtual match is a simulated shooting round between two teams. Instant matches finish in
              seconds; championship matches follow a scheduled 16-team knockout bracket.
            </p>
          </Card>
          <Card className="glass p-5">
            <Trophy className="h-6 w-6 text-gold" />
            <h2 className="font-bold mt-3">Odds and payouts</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Each market has decimal odds. Payout = stake × odds if the selection wins. Live odds shift
              round-by-round as the match progresses.
            </p>
          </Card>
          <Card className="glass p-5">
            <Clock className="h-6 w-6 text-gold" />
            <h2 className="font-bold mt-3">When markets close</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Markets lock the moment a round is in motion. Tickets are settled automatically once the
              round outcome is confirmed, and results appear in your bet history.
            </p>
          </Card>
          <Card className="glass p-5">
            <Users className="h-6 w-6 text-gold" />
            <h2 className="font-bold mt-3">Gangs and standing</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Every player belongs to a gang. Your bets contribute to your gang's leaderboard, and roles
              (Rookie, Shooter, Veteran, Captain) unlock through consistent play.
            </p>
          </Card>
          <Card className="glass p-5">
            <Shield className="h-6 w-6 text-gold" />
            <h2 className="font-bold mt-3">Risk-free by design</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Because tokens are virtual, ECB is a game — not a gambling product. There's no deposit, no
              withdrawal to cash, and no way to lose real money.
            </p>
          </Card>
        </div>

        <h2 className="mt-8 text-2xl font-bold">Step-by-step: placing a virtual bet</h2>
        <ol className="mt-3 space-y-2 text-muted-foreground list-decimal pl-5">
          <li>Open a <Link to="/matches" className="text-primary">live or upcoming match</Link>.</li>
          <li>Pick a market (winner, total, handicap, etc.) and add it to your bet slip.</li>
          <li>Enter a stake in virtual tokens — your potential payout updates in real time.</li>
          <li>Submit the ticket before the round locks.</li>
          <li>Watch the round settle and check your <Link to="/bet-history" className="text-primary">bet history</Link>.</li>
        </ol>

        <h2 className="mt-8 text-2xl font-bold">Instant vs Championship virtual</h2>
        <p className="text-muted-foreground mt-2">
          Instant virtual is a fast, on-demand format — a new round starts every few minutes. Championship
          virtual is a scheduled 16-team bracket that plays out across the day, with bigger prize pools and
          longer betting windows. Both use the same core mechanics described above.
        </p>

        <h2 className="mt-8 text-2xl font-bold">Is this gambling?</h2>
        <p className="text-muted-foreground mt-2">
          No. ECB uses virtual tokens that have no cash value. Nothing you win here converts to money,
          which is exactly what makes it risk-free entertainment. If wagering — even with virtual tokens —
          stops feeling fun, take a break.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/matches" className="btn-luxury">See live matches</Link>
          <Link to="/virtual" className="btn-luxury">Try virtual matches</Link>
          <Link to="/about" className="text-primary underline self-center">About the league</Link>
        </div>
      </article>
    </Layout>
  );
}