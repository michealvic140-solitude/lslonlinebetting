import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Activity, Users, Eye, MousePointerClick, Clock, RefreshCw, Cookie } from "lucide-react";

type EventRow = {
  id: number;
  session_id: string;
  user_id: string | null;
  event_type: string;
  path: string | null;
  referrer: string | null;
  user_agent: string | null;
  created_at: string;
};

type Range = "24h" | "7d" | "30d";

function since(range: Range) {
  const now = Date.now();
  const ms = range === "24h" ? 86_400_000 : range === "7d" ? 7 * 86_400_000 : 30 * 86_400_000;
  return new Date(now - ms).toISOString();
}

export function UserExperiencePanel() {
  const [range, setRange] = useState<Range>("24h");
  const [rows, setRows] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(0);
  const [consentRejected, setConsentRejected] = useState(0);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const from = since(range);
    const { data } = await (supabase as any)
      .from("analytics_events")
      .select("id,session_id,user_id,event_type,path,referrer,user_agent,created_at")
      .gte("created_at", from)
      .order("created_at", { ascending: false })
      .limit(5000);
    setRows((data ?? []) as EventRow[]);

    const userIds = Array.from(new Set(((data ?? []) as EventRow[]).map(r => r.user_id).filter(Boolean))) as string[];
    if (userIds.length) {
      const { data: profs } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, ingame_name")
        .in("id", userIds);
      const map: Record<string, string> = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = p.ingame_name || p.full_name || "user"; });
      setNameById(map);
    } else {
      setNameById({});
    }

    const { count: acc } = await (supabase as any)
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "cookie_consent")
      .contains("meta", { value: "accepted" });
    setConsentAccepted(acc ?? 0);

    setLoading(false);
  };

  useEffect(() => { load(); }, [range]);

  const metrics = useMemo(() => {
    const pageviews = rows.filter(r => r.event_type === "pageview");
    const sessions = new Set(rows.map(r => r.session_id));
    const users = new Set(rows.map(r => r.user_id).filter(Boolean));
    const guests = new Set(rows.filter(r => !r.user_id).map(r => r.session_id));

    const topPaths = new Map<string, number>();
    pageviews.forEach(r => {
      const p = r.path ?? "(unknown)";
      topPaths.set(p, (topPaths.get(p) ?? 0) + 1);
    });
    const topEvents = new Map<string, number>();
    rows.forEach(r => topEvents.set(r.event_type, (topEvents.get(r.event_type) ?? 0) + 1));

    const topReferrers = new Map<string, number>();
    rows.forEach(r => {
      if (!r.referrer) return;
      try {
        const host = new URL(r.referrer).hostname;
        if (!host) return;
        topReferrers.set(host, (topReferrers.get(host) ?? 0) + 1);
      } catch {}
    });

    // Sessions per hour (last 24) or per day (7d/30d)
    const buckets: { label: string; count: number }[] = [];
    const now = Date.now();
    if (range === "24h") {
      for (let i = 23; i >= 0; i--) {
        const start = now - (i + 1) * 3_600_000;
        const end = now - i * 3_600_000;
        const c = pageviews.filter(r => {
          const t = new Date(r.created_at).getTime();
          return t >= start && t < end;
        }).length;
        const d = new Date(end);
        buckets.push({ label: `${d.getHours()}h`, count: c });
      }
    } else {
      const days = range === "7d" ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const start = now - (i + 1) * 86_400_000;
        const end = now - i * 86_400_000;
        const c = pageviews.filter(r => {
          const t = new Date(r.created_at).getTime();
          return t >= start && t < end;
        }).length;
        const d = new Date(end);
        buckets.push({ label: `${d.getMonth() + 1}/${d.getDate()}`, count: c });
      }
    }
    const peak = Math.max(1, ...buckets.map(b => b.count));

    return {
      pageviewCount: pageviews.length,
      sessionCount: sessions.size,
      userCount: users.size,
      guestCount: guests.size,
      topPaths: [...topPaths.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
      topEvents: [...topEvents.entries()].sort((a, b) => b[1] - a[1]),
      topReferrers: [...topReferrers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      buckets,
      peak,
    };
  }, [rows, range]);

  const stat = (icon: any, label: string, value: string | number, tint: string) => {
    const Icon = icon;
    return (
      <Card className={`p-3 border ${tint}`}>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </div>
        <div className="text-2xl font-black gradient-gold-text tabular-nums">{value}</div>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 mr-auto">
          <Cookie className="h-5 w-5 text-primary" />
          <div>
            <div className="font-bold text-sm">User Experience</div>
            <div className="text-[11px] text-muted-foreground">
              Behavior data collected from users who accepted cookies.
            </div>
          </div>
        </div>
        <div className="flex items-center rounded-md border border-primary/20 overflow-hidden">
          {(["24h","7d","30d"] as Range[]).map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-[11px] uppercase tracking-widest ${range === r ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >{r}</button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stat(Eye, "Page views", metrics.pageviewCount, "border-primary/25")}
        {stat(Activity, "Sessions", metrics.sessionCount, "border-emerald-500/25")}
        {stat(Users, "Signed-in users", metrics.userCount, "border-sky-500/25")}
        {stat(Cookie, "Cookies accepted (total)", consentAccepted, "border-amber-500/25")}
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> Traffic ({range})
          </div>
          <div className="text-[10px] text-muted-foreground">Peak {metrics.peak}</div>
        </div>
        <div className="flex items-end gap-1 h-32">
          {metrics.buckets.map((b, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div
                className="w-full rounded-t bg-gradient-to-t from-primary/60 to-primary/20 border border-primary/40"
                style={{ height: `${(b.count / metrics.peak) * 100}%`, minHeight: b.count ? 2 : 0 }}
                title={`${b.label}: ${b.count}`}
              />
              <div className="text-[8px] text-muted-foreground truncate w-full text-center">{b.label}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Top pages</div>
          {metrics.topPaths.length === 0 && <div className="text-xs text-muted-foreground">No page views yet.</div>}
          <div className="space-y-1">
            {metrics.topPaths.map(([p, c]) => (
              <div key={p} className="flex items-center gap-2 text-xs">
                <div className="flex-1 truncate font-mono">{p}</div>
                <div className="w-24 h-1.5 bg-muted/40 rounded overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(c / (metrics.topPaths[0]?.[1] || 1)) * 100}%` }} />
                </div>
                <div className="w-10 text-right font-mono tabular-nums text-primary">{c}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Event breakdown</div>
          {metrics.topEvents.length === 0 && <div className="text-xs text-muted-foreground">No events yet.</div>}
          <div className="space-y-1">
            {metrics.topEvents.map(([e, c]) => (
              <div key={e} className="flex items-center gap-2 text-xs">
                <MousePointerClick className="h-3 w-3 text-primary shrink-0" />
                <div className="flex-1 truncate">{e}</div>
                <div className="font-mono tabular-nums text-primary">{c}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Top referrers</div>
          {metrics.topReferrers.length === 0 && <div className="text-xs text-muted-foreground">Mostly direct traffic.</div>}
          <div className="space-y-1">
            {metrics.topReferrers.map(([host, c]) => (
              <div key={host} className="flex items-center gap-2 text-xs">
                <div className="flex-1 truncate">{host}</div>
                <div className="font-mono tabular-nums text-primary">{c}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Recent activity</div>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {rows.slice(0, 40).map((r) => (
              <div key={r.id} className="flex items-center gap-2 text-[11px] border-b border-border/30 pb-1">
                <div className="w-20 truncate text-muted-foreground">{new Date(r.created_at).toLocaleTimeString()}</div>
                <div className="w-24 truncate text-primary font-mono">{r.event_type}</div>
                <div className="flex-1 truncate font-mono text-muted-foreground">{r.path ?? "—"}</div>
                <div className="w-24 truncate text-right text-muted-foreground">{r.user_id ? (nameById[r.user_id] ?? "user") : "guest"}</div>
              </div>
            ))}
            {rows.length === 0 && <div className="text-xs text-muted-foreground">No events in this window.</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}