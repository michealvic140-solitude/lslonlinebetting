import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Filter, Send, Users, Clock, CalendarClock, X, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { broadcastPush, getPushSubscriberCount, listScheduledPushes, cancelScheduledPush } from "@/lib/push-admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImageSettingControl } from "@/components/admin/ImageSettingControl";

const roles = ["any", "viewer", "shooter", "gang_leader", "registered", "moderator", "admin", "sponsor"];
const activityOptions = [
  { value: "any", label: "Any last-active date" },
  { value: "1", label: "Active in 24 hours" },
  { value: "7", label: "Active in 7 days" },
  { value: "30", label: "Active in 30 days" },
  { value: "90", label: "Active in 90 days" },
];

function normalizeLocale(value: string) {
  return value.trim().replace("_", "-");
}

function fmt(dt: string) {
  try { return new Date(dt).toLocaleString(); } catch { return dt; }
}

export function PushBroadcastPanel() {
  const send = useServerFn(broadcastPush);
  const readCount = useServerFn(getPushSubscriberCount);
  const readScheduled = useServerFn(listScheduledPushes);
  const cancelScheduled = useServerFn(cancelScheduledPush);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [image, setImage] = useState("");
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [role, setRole] = useState("any");
  const [locale, setLocale] = useState("");
  const [lastActiveDays, setLastActiveDays] = useState("any");

  const [mode, setMode] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [totalRaw, setTotalRaw] = useState<number | null>(null);
  const [pruning, setPruning] = useState(false);
  const [subs, setSubs] = useState<Array<{ user_id: string; name: string; ingame: string | null; discord: string | null; last: string | null; ua: string | null; enabled: boolean; devices: number }>>([]);
  const [showSubs, setShowSubs] = useState(true);
  const [subSearch, setSubSearch] = useState("");

  const filters = {
    role: role === "any" ? "any" : role,
    locale: normalizeLocale(locale),
    lastActiveDays: lastActiveDays === "any" ? null : Number(lastActiveDays),
  };

  const loadCount = () => {
    readCount({ data: filters }).then((r: any) => setCount(r?.count ?? 0)).catch(() => setCount(0));
  };
  const loadTotal = async () => {
    const { count: c } = await (supabase as any).from("push_subscriptions").select("id", { count: "exact", head: true });
    setTotalRaw(typeof c === "number" ? c : null);
  };
  const loadSubs = async () => {
    const { data } = await (supabase as any)
      .from("push_subscriptions")
      .select("user_id,last_seen_at,enabled,user_agent")
      .eq("enabled", true)
      .order("last_seen_at", { ascending: false })
      .limit(1000);
    const rows = (data ?? []) as any[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (ids.length === 0) { setSubs([]); return; }
    const { data: profs } = await (supabase as any)
      .from("profiles").select("id,full_name,ingame_name,discord_username,email").in("id", ids);
    const profMap = new Map(
      (profs ?? []).map((p: any) => [p.id, p]),
    );
    const byUser = new Map<string, { user_id: string; name: string; ingame: string | null; discord: string | null; last: string | null; ua: string | null; enabled: boolean; devices: number }>();
    for (const r of rows) {
      const p: any = profMap.get(r.user_id) ?? {};
      const displayName =
        p.ingame_name || p.full_name || p.discord_username || p.email || `User ${String(r.user_id).slice(0, 8)}`;
      const existing = byUser.get(r.user_id);
      if (existing) {
        existing.devices += 1;
        if (r.last_seen_at && (!existing.last || r.last_seen_at > existing.last)) existing.last = r.last_seen_at;
      } else {
        byUser.set(r.user_id, {
          user_id: r.user_id,
          name: displayName,
          ingame: p.ingame_name ?? null,
          discord: p.discord_username ?? null,
          last: r.last_seen_at,
          ua: r.user_agent ?? null,
          enabled: r.enabled,
          devices: 1,
        });
      }
    }
    setSubs([...byUser.values()]);
  };
  const loadScheduled = () => {
    readScheduled().then((r: any) => setScheduled(r?.items ?? [])).catch(() => setScheduled([]));
  };
  useEffect(() => { loadCount(); }, [role, locale, lastActiveDays]);
  useEffect(() => { loadScheduled(); loadTotal(); }, []);
  useEffect(() => { if (showSubs) loadSubs(); }, [showSubs]);

  const filteredSubs = subs.filter((s) => {
    if (!subSearch.trim()) return true;
    const q = subSearch.trim().toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.ingame ?? "").toLowerCase().includes(q) ||
      (s.discord ?? "").toLowerCase().includes(q)
    );
  });

  const deviceLabel = (ua: string | null) => {
    if (!ua) return "Device";
    const s = ua.toLowerCase();
    if (s.includes("iphone")) return "iPhone";
    if (s.includes("ipad")) return "iPad";
    if (s.includes("android")) return "Android";
    if (s.includes("windows")) return "Windows";
    if (s.includes("mac")) return "Mac";
    if (s.includes("linux")) return "Linux";
    return "Device";
  };

  const pruneDead = async () => {
    if (!window.confirm("Remove push subscriptions that are disabled, unseen for 60+ days, or have failed 10+ times? This tightens the subscriber count to reachable devices only.")) return;
    setPruning(true);
    const { data, error } = await (supabase as any).rpc("prune_dead_push_subscriptions");
    setPruning(false);
    if (error) return toast.error(error.message);
    toast.success(`Removed ${data ?? 0} dead subscription${data === 1 ? "" : "s"}`);
    loadCount(); loadTotal();
  };

  const submit = async () => {
    if (!title.trim()) { toast.error("Add a title for the notification."); return; }
    let scheduledIso = "";
    if (mode === "later") {
      if (!scheduledFor) { toast.error("Pick a date and time to schedule."); return; }
      const when = new Date(scheduledFor);
      if (isNaN(when.getTime()) || when.getTime() < Date.now() + 60_000) {
        toast.error("Schedule a time at least a minute in the future.");
        return;
      }
      scheduledIso = when.toISOString();
    }
    setBusy(true);
    try {
      const res: any = await send({ data: { title: title.trim(), body: body.trim(), link: link.trim(), image: image.trim(), ...filters, scheduledFor: scheduledIso } });
      if (res?.ok && res?.scheduled) {
        toast.success(`Push scheduled for ${fmt(res.scheduledFor)}.`);
        setTitle(""); setBody(""); setLink(""); setImage(""); setScheduledFor("");
        loadScheduled();
      } else if (res?.ok) {
        toast.success(`Push sent to ${res.sent} of ${res.total} targeted device${res.total === 1 ? "" : "s"}.`);
        setTitle(""); setBody(""); setLink(""); setImage("");
        loadCount();
      } else {
        toast.error(res?.error || "Failed to send push.");
      }
    } catch (e: any) {
      toast.error(e?.message || "Failed to send push.");
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async (id: string) => {
    const res: any = await cancelScheduled({ data: { id } });
    if (res?.ok) { toast.success("Scheduled push cancelled."); loadScheduled(); }
    else toast.error(res?.error || "Could not cancel.");
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      sending: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      sent: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      failed: "bg-red-500/15 text-red-400 border-red-500/30",
      cancelled: "bg-muted text-muted-foreground border-border",
    };
    return map[s] || map.cancelled;
  };

  const pending = scheduled.filter((s) => s.status === "pending" || s.status === "sending");
  const history = scheduled.filter((s) => s.status !== "pending" && s.status !== "sending");

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-1.5">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          <div className="font-bold">Push to subscribers</div>
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-[11px] text-muted-foreground hover:text-destructive" disabled={pruning} onClick={pruneDead}>
            <Trash2 className="h-3 w-3 mr-1" />{pruning ? "Pruning…" : "Prune dead"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Send instantly or schedule for a future time. Delivered to mobile notification bars.
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold text-foreground tabular-nums">{count ?? "—"}</span> active (reachable)
          </div>
          {totalRaw != null && totalRaw !== (count ?? -1) && (
            <div className="text-[11px] opacity-75">
              <span className="tabular-nums">{totalRaw}</span> total rows in DB
            </div>
          )}
          <Button size="sm" variant="ghost" className="h-6 text-[11px] ml-auto" onClick={() => setShowSubs((v) => !v)}>
            {showSubs ? "Hide subscribers" : `View subscribers${subs.length ? ` (${subs.length})` : ""}`}
          </Button>
        </div>
        {showSubs && (
          <div className="mt-2 space-y-2">
            <Input
              value={subSearch}
              onChange={(e) => setSubSearch(e.target.value)}
              placeholder="Search subscribers by name, in-game name, or Discord…"
              className="h-8 text-[12px]"
            />
            <div className="rounded-md border border-border bg-background/40 max-h-80 overflow-y-auto divide-y divide-border/50">
              {filteredSubs.length === 0 ? (
                <div className="p-3 text-[11px] text-muted-foreground">
                  {subs.length === 0 ? "No active subscribers yet." : "No subscribers match that search."}
                </div>
              ) : filteredSubs.map((s) => (
                <div key={s.user_id} className="flex items-start justify-between gap-2 px-3 py-2 text-[11px]">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate text-foreground">{s.name}</div>
                    <div className="text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                      <span className="rounded border border-border/60 bg-background/60 px-1.5 py-0.5 text-[9px] uppercase tracking-widest">{deviceLabel(s.ua)}</span>
                      {s.discord && <span className="truncate">@{s.discord}</span>}
                      {s.devices > 1 && <span className="text-primary/80">· {s.devices} devices</span>}
                    </div>
                  </div>
                  <div className="text-muted-foreground tabular-nums shrink-0 text-right">
                    {s.last ? new Date(s.last).toLocaleDateString() : "—"}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Showing {filteredSubs.length} of {subs.length} subscribed user{subs.length === 1 ? "" : "s"} (deduped across devices).
            </div>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-primary" />
          <div className="font-bold text-sm">Audience filters</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Role</label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue placeholder="Any role" /></SelectTrigger>
              <SelectContent>
                {roles.map((r) => <SelectItem key={r} value={r}>{r === "any" ? "Any role" : r.replaceAll("_", " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Locale</label>
            <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder="Any, en, en-US" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase text-muted-foreground">Last active</label>
            <Select value={lastActiveDays} onValueChange={setLastActiveDays}>
              <SelectTrigger><SelectValue placeholder="Any activity" /></SelectTrigger>
              <SelectContent>
                {activityOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Matching now: <span className="font-bold text-foreground tabular-nums">{count ?? "—"}</span> active subscribed device{count === 1 ? "" : "s"}.
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Title</label>
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder="🔥 Big match starting now!" />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Message</label>
          <Textarea value={body} maxLength={400} rows={3} onChange={(e) => setBody(e.target.value)} placeholder="Tap to watch the action live and place your bets." />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] uppercase text-muted-foreground">Link (optional)</label>
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/matches" />
        </div>
        <ImageSettingControl
          label="Notification image (optional)"
          value={image}
          onChange={(url) => setImage(url ?? "")}
          showFitControls={false}
          aspect="16 / 9"
          help="Upload from your device or paste a URL. Shown as a large picture inside the notification on Android/Chrome/desktop."
        />

        <div className="space-y-2 rounded-lg border border-border/60 p-3">
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant={mode === "now" ? "default" : "outline"} className="gap-1.5 flex-1" onClick={() => setMode("now")}>
              <Send className="h-3.5 w-3.5" /> Send now
            </Button>
            <Button type="button" size="sm" variant={mode === "later" ? "default" : "outline"} className="gap-1.5 flex-1" onClick={() => setMode("later")}>
              <CalendarClock className="h-3.5 w-3.5" /> Schedule
            </Button>
          </div>
          {mode === "later" && (
            <div className="space-y-1">
              <label className="text-[10px] uppercase text-muted-foreground">Send at</label>
              <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Uses your device's local time. Delivered within a minute of the chosen time.</p>
            </div>
          )}
        </div>

        <Button className="btn-luxury w-full gap-2" disabled={busy} onClick={submit}>
          {mode === "later" ? <CalendarClock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
          {busy ? "Working…" : mode === "later" ? "Schedule push" : "Send push now"}
        </Button>
      </Card>

      {pending.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <div className="font-bold text-sm">Scheduled ({pending.length})</div>
          </div>
          <div className="space-y-2">
            {pending.map((s) => (
              <div key={s.id} className="flex items-start gap-2 rounded-lg border border-border/60 p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{s.title}</div>
                  {s.body && <div className="text-xs text-muted-foreground truncate">{s.body}</div>}
                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
                    <CalendarClock className="h-3 w-3" /> {fmt(s.scheduled_for)}
                    <span className={`ml-1 rounded border px-1.5 py-0.5 text-[10px] ${statusBadge(s.status)}`}>{s.status}</span>
                  </div>
                </div>
                {s.status === "pending" && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-red-400" onClick={() => doCancel(s.id)}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {history.length > 0 && (
        <Card className="p-4 space-y-2">
          <div className="font-bold text-sm">Recent scheduled sends</div>
          <div className="space-y-1.5">
            {history.slice(0, 10).map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                {s.status === "sent" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                <span className="font-medium truncate flex-1">{s.title}</span>
                {s.status === "sent"
                  ? <span className="text-muted-foreground tabular-nums shrink-0">{s.sent_count}/{s.total_count} sent</span>
                  : <span className={`rounded border px-1.5 py-0.5 text-[10px] ${statusBadge(s.status)}`}>{s.status}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
