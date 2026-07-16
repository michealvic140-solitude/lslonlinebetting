import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Repeat, Send, Save, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listRecurringPushes, updateRecurringPush, triggerRecurringPush } from "@/lib/recurring-push.functions";

type Row = {
  key: string;
  label: string;
  cadence: "daily" | "hourly";
  enabled: boolean;
  title: string;
  body: string;
  link: string;
  hour_utc: number | null;
  start_hour_utc: number;
  end_hour_utc: number;
  cycles_content: "quote" | "encouragement" | null;
  next_index: number;
  last_sent_at: string | null;
};

const hours = Array.from({ length: 24 }, (_, i) => i);

export function RecurringPushPanel() {
  const load = useServerFn(listRecurringPushes);
  const save = useServerFn(updateRecurringPush);
  const send = useServerFn(triggerRecurringPush);
  const [items, setItems] = useState<Row[]>([]);
  const [dirty, setDirty] = useState<Record<string, Partial<Row>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => load().then((r: any) => setItems(r?.items ?? [])).catch(() => setItems([]));
  useEffect(() => { refresh(); }, []);

  const patch = (key: string, changes: Partial<Row>) =>
    setDirty((d) => ({ ...d, [key]: { ...d[key], ...changes } }));

  const merged = (row: Row): Row => ({ ...row, ...(dirty[row.key] || {}) });

  const persist = async (row: Row) => {
    const changes = dirty[row.key];
    if (!changes) return;
    setBusy(row.key);
    try {
      const res: any = await save({ data: { key: row.key, ...changes } });
      if (res?.ok) {
        toast.success("Saved");
        setDirty((d) => { const n = { ...d }; delete n[row.key]; return n; });
        refresh();
      } else toast.error(res?.error || "Save failed");
    } finally { setBusy(null); }
  };

  const toggle = async (row: Row, enabled: boolean) => {
    setBusy(row.key);
    try {
      const res: any = await save({ data: { key: row.key, enabled } });
      if (res?.ok) {
        setItems((prev) => prev.map((r) => r.key === row.key ? { ...r, enabled } : r));
        toast.success(enabled ? "Reminder turned on" : "Reminder turned off");
      } else toast.error(res?.error || "Toggle failed");
    } finally { setBusy(null); }
  };

  const sendNow = async (row: Row) => {
    setBusy(row.key);
    try {
      const res: any = await send({ data: { key: row.key } });
      if (res?.ok) toast.success(`Sent to ${res.sent}/${res.total} devices`);
      else toast.error(res?.error || "Send failed");
      refresh();
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-1">
        <div className="flex items-center gap-2">
          <Repeat className="h-5 w-5 text-primary" />
          <div className="font-bold">Recurring push reminders</div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Automated daily and hourly (8:00–22:00 UTC) push nudges. Word of Encouragement and Motivational Quote cycle through 100 entries each and loop back to the start after the last one. Times use UTC; adjust the hour to match your timezone if needed.
        </p>
      </Card>

      {items.map((row) => {
        const m = merged(row);
        const isDirty = !!dirty[row.key];
        return (
          <Card key={row.key} className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="font-bold text-sm truncate">{row.label}</div>
                  {row.cycles_content && (
                    <span className="inline-flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-primary">
                      <Sparkles className="h-3 w-3" /> cycles {row.cycles_content}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />
                    {row.cadence === "daily" ? `Daily @ ${String(m.hour_utc ?? 0).padStart(2, "0")}:00 UTC` : `Hourly ${String(m.start_hour_utc).padStart(2,"0")}:00–${String(m.end_hour_utc).padStart(2,"0")}:00 UTC`}
                  </span>
                  {row.last_sent_at && <span>Last sent {new Date(row.last_sent_at).toLocaleString()}</span>}
                  {row.cycles_content && <span>Next entry #{row.next_index + 1}/100</span>}
                </div>
              </div>
              <Switch checked={row.enabled} onCheckedChange={(v) => toggle(row, v)} disabled={busy === row.key} />
            </div>

            <div className="grid gap-2">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Title</label>
                <Input value={m.title} maxLength={120} onChange={(e) => patch(row.key, { title: e.target.value })} />
              </div>
              {!row.cycles_content && (
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Message</label>
                  <Textarea rows={2} value={m.body} maxLength={400} onChange={(e) => patch(row.key, { body: e.target.value })} />
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground">Link</label>
                  <Input value={m.link} onChange={(e) => patch(row.key, { link: e.target.value })} placeholder="/" />
                </div>
                {row.cadence === "daily" ? (
                  <div>
                    <label className="text-[10px] uppercase text-muted-foreground">Hour (UTC)</label>
                    <Select value={String(m.hour_utc ?? 9)} onValueChange={(v) => patch(row.key, { hour_utc: Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {hours.map((h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2,"0")}:00</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase text-muted-foreground">Start (UTC)</label>
                      <Select value={String(m.start_hour_utc)} onValueChange={(v) => patch(row.key, { start_hour_utc: Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {hours.map((h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2,"0")}:00</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase text-muted-foreground">End (UTC)</label>
                      <Select value={String(m.end_hour_utc)} onValueChange={(v) => patch(row.key, { end_hour_utc: Number(v) })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {hours.map((h) => <SelectItem key={h} value={String(h)}>{String(h).padStart(2,"0")}:00</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="gap-1.5" disabled={!isDirty || busy === row.key} onClick={() => persist(row)}>
                <Save className="h-3.5 w-3.5" /> Save
              </Button>
              <Button size="sm" variant="ghost" className="gap-1.5" disabled={busy === row.key} onClick={() => sendNow(row)}>
                <Send className="h-3.5 w-3.5" /> Send now
              </Button>
            </div>
          </Card>
        );
      })}

      {items.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">Loading recurring reminders…</Card>
      )}
    </div>
  );
}
