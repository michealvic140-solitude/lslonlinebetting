import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bell, Filter, Send, Users, Clock, CalendarClock, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { broadcastPush, getPushSubscriberCount, listScheduledPushes, cancelScheduledPush } from "@/lib/push-admin.functions";
import { toast } from "sonner";

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
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [role, setRole] = useState("any");
  const [locale, setLocale] = useState("");
  const [lastActiveDays, setLastActiveDays] = useState("any");

  const [mode, setMode] = useState<"now" | "later">("now");
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduled, setScheduled] = useState<any[]>([]);

  const filters = {
    role: role === "any" ? "any" : role,
    locale: normalizeLocale(locale),
    lastActiveDays: lastActiveDays === "any" ? null : Number(lastActiveDays),
  };

  const loadCount = () => {
    readCount({ data: filters }).then((r: any) => setCount(r?.count ?? 0)).catch(() => setCount(0));
  };
  const loadScheduled = () => {
    readScheduled().then((r: any) => setScheduled(r?.items ?? [])).catch(() => setScheduled([]));
  };
  useEffect(() => { loadCount(); }, [role, locale, lastActiveDays]);
  useEffect(() => { loadScheduled(); }, []);

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
      const res: any = await send({ data: { title: title.trim(), body: body.trim(), link: link.trim(), ...filters, scheduledFor: scheduledIso } });
      if (res?.ok && res?.scheduled) {
        toast.success(`Push scheduled for ${fmt(res.scheduledFor)}.`);
        setTitle(""); setBody(""); setLink(""); setScheduledFor("");
        loadScheduled();
      } else if (res?.ok) {
        toast.success(`Push sent to ${res.sent} of ${res.total} targeted device${res.total === 1 ? "" : "s"}.`);
        setTitle(""); setBody(""); setLink("");
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
        </div>
        <p className="text-[11px] text-muted-foreground">
          Send instantly or schedule for a future time. Delivered to mobile notification bars.
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1">
          <Users className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground tabular-nums">{count ?? "—"}</span> subscribed device{count === 1 ? "" : "s"}
        </div>
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
