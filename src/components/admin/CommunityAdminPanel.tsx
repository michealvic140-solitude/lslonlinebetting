import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Vote, Trash2, Gift, ChevronDown, ChevronRight, ShoppingBag, LifeBuoy, Plus } from "lucide-react";
import { ImageSettingControl } from "@/components/admin/ImageSettingControl";

const sb = supabase as any;

/* ------------------------------------------------------------------ Polls */
export function PollsAdminPanel() {
  const [enabled, setEnabled] = useState(true);
  const [polls, setPolls] = useState<any[]>([]);
  const [votes, setVotes] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState("");

  async function load() {
    const [{ data: en }, { data: ps }, { data: vs }] = await Promise.all([
      sb.from("app_settings").select("polls_enabled").eq("id", 1).maybeSingle(),
      sb.from("polls").select("*").order("created_at", { ascending: false }),
      sb.from("poll_votes").select("id,poll_id,user_id,selected_index"),
    ]);
    setEnabled(!!en?.polls_enabled);
    setPolls(ps ?? []);
    setVotes(vs ?? []);
    const ids = Array.from(new Set((vs ?? []).map((v: any) => v.user_id)));
    if (ids.length) {
      const { data: profs } = await sb.from("profiles").select("id,full_name,ingame_name").in("id", ids);
      const m: Record<string, any> = {};
      (profs ?? []).forEach((p: any) => { m[p.id] = p; });
      setProfiles(m);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggle(v: boolean) {
    setEnabled(v);
    await sb.from("app_settings").update({ polls_enabled: v }).eq("id", 1);
  }
  async function createPoll() {
    const options = opts.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!q.trim() || options.length < 2) return toast.error("Question and at least 2 options required");
    const { error } = await sb.from("polls").insert({ question: q, options, is_active: true });
    if (error) return toast.error(error.message);
    setQ(""); setOpts(""); toast.success("Poll created"); load();
  }
  async function setActive(id: string, is_active: boolean) {
    await sb.from("polls").update({ is_active }).eq("id", id); load();
  }
  async function delPoll(id: string) {
    if (!confirm("Delete this poll and all its votes?")) return;
    await sb.from("poll_votes").delete().eq("poll_id", id);
    await sb.from("polls").delete().eq("id", id); toast.success("Deleted"); load();
  }
  async function removeVote(voteId: string) {
    const { error } = await sb.from("poll_votes").delete().eq("id", voteId);
    if (error) return toast.error(error.message);
    toast.success("Vote removed"); load();
  }
  async function gift(userId: string) {
    const raw = prompt("Gift how many tokens to this voter?");
    const amt = Number(raw);
    if (!raw || !Number.isFinite(amt) || amt <= 0) return;
    const { error } = await sb.rpc("admin_send_gift", { _user_id: userId, _amount: amt, _message: "Thanks for voting!" });
    if (error) return toast.error(error.message);
    toast.success(`Gifted ${amt} tokens`);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold"><Vote className="h-4 w-4 text-primary" />Polls enabled for users</div>
        <Switch checked={enabled} onCheckedChange={toggle} />
      </Card>
      <Card className="p-4 space-y-2">
        <div className="font-bold text-sm">Create a poll</div>
        <Input placeholder="Question" value={q} onChange={(e) => setQ(e.target.value)} />
        <Textarea rows={4} placeholder="One option per line" value={opts} onChange={(e) => setOpts(e.target.value)} />
        <Button className="btn-luxury" onClick={createPoll}><Plus className="h-4 w-4 mr-1" />Create poll</Button>
      </Card>
      {polls.map((p) => {
        const pVotes = votes.filter((v) => v.poll_id === p.id);
        const total = pVotes.length;
        const options: string[] = Array.isArray(p.options) ? p.options : [];
        const isOpen = open[p.id];
        return (
          <Card key={p.id} className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-bold">{p.question}</div>
                <div className="text-xs text-muted-foreground">{total} total vote{total === 1 ? "" : "s"}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className={p.is_active ? "border-emerald-500/50 text-emerald-300" : "border-muted-foreground/40"}>{p.is_active ? "Active" : "Hidden"}</Badge>
                <Switch checked={!!p.is_active} onCheckedChange={(v) => setActive(p.id, v)} />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => delPoll(p.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="space-y-1.5">
              {options.map((o, i) => {
                const cnt = pVotes.filter((v) => v.selected_index === i).length;
                const pct = total ? Math.round((cnt / total) * 100) : 0;
                return (
                  <div key={i} className="relative rounded-lg border border-border p-2 overflow-hidden">
                    <span className="absolute inset-y-0 left-0 bg-primary/15" style={{ width: `${pct}%` }} />
                    <span className="relative flex justify-between text-sm"><span>{o}</span><span className="font-bold">{cnt} · {pct}%</span></span>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setOpen((s) => ({ ...s, [p.id]: !isOpen }))} className="flex items-center gap-1 text-xs text-primary font-semibold">
              {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}Voters ({total})
            </button>
            {isOpen && (
              <div className="space-y-1">
                {pVotes.length === 0 && <div className="text-xs text-muted-foreground">No votes yet.</div>}
                {pVotes.map((v) => (
                  <div key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs">
                    <div className="min-w-0">
                      <span className="font-semibold truncate">{profiles[v.user_id]?.ingame_name || profiles[v.user_id]?.full_name || "Player"}</span>
                      <span className="text-muted-foreground"> · {options[v.selected_index] ?? "?"}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => gift(v.user_id)}><Gift className="h-3 w-3 mr-1" />Gift</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-destructive" onClick={() => removeVote(v.id)}><Trash2 className="h-3 w-3 mr-1" />Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------- Shop */
export function ShopAdminPanel() {
  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [ni, setNi] = useState({ name: "", cost: "", stock: "", image_url: "", description: "" });

  async function load() {
    const [{ data: en }, { data: it }, { data: rd }] = await Promise.all([
      sb.from("app_settings").select("shop_enabled").eq("id", 1).maybeSingle(),
      sb.from("shop_items").select("*").order("created_at", { ascending: false }),
      sb.from("shop_redemptions").select("*, shop_items(name)").order("created_at", { ascending: false }),
    ]);
    setEnabled(en?.shop_enabled !== false);
    setItems(it ?? []);
    setOrders(rd ?? []);
    const ids = Array.from(new Set((rd ?? []).map((r: any) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await sb.from("profiles").select("id,full_name,ingame_name").in("id", ids);
      const m: Record<string, any> = {};
      (profs ?? []).forEach((p: any) => { m[p.id] = p; });
      setProfiles(m);
    }
  }
  useEffect(() => { load(); }, []);

  async function toggle(v: boolean) { setEnabled(v); await sb.from("app_settings").update({ shop_enabled: v }).eq("id", 1); }
  async function addItem() {
    if (!ni.name.trim() || !Number(ni.cost)) return toast.error("Name and cost required");
    const { error } = await sb.from("shop_items").insert({
      name: ni.name, cost: Number(ni.cost), stock: ni.stock === "" ? null : Number(ni.stock),
      image_url: ni.image_url || null, description: ni.description || null, is_active: true,
    });
    if (error) return toast.error(error.message);
    setNi({ name: "", cost: "", stock: "", image_url: "", description: "" }); toast.success("Item added"); load();
  }
  async function setItemActive(id: string, is_active: boolean) { await sb.from("shop_items").update({ is_active }).eq("id", id); load(); }
  async function delItem(id: string) { if (!confirm("Delete this item?")) return; await sb.from("shop_items").delete().eq("id", id); load(); }
  async function setStatus(id: string, status: string) {
    const { error } = await sb.from("shop_redemptions").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status}`); load();
  }
  async function refund(id: string) {
    if (!confirm("Refund this order? Tokens will be returned to the user.")) return;
    const { error } = await sb.rpc("refund_shop_redemption", { _id: id });
    if (error) return toast.error(error.message);
    toast.success("Refunded"); load();
  }

  const statusColor = (s: string) => s === "fulfilled" || s === "approved" ? "border-emerald-500/50 text-emerald-300"
    : s === "declined" ? "border-destructive/50 text-destructive"
    : s === "refunded" ? "border-sky-500/50 text-sky-300" : "border-primary/50 text-primary";

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold"><ShoppingBag className="h-4 w-4 text-primary" />Shop open to users</div>
        <Switch checked={enabled} onCheckedChange={toggle} />
      </Card>

      <Card className="p-4 space-y-2">
        <div className="font-bold text-sm">Add reward item</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <Input placeholder="Name" value={ni.name} onChange={(e) => setNi({ ...ni, name: e.target.value })} />
          <Input placeholder="Cost (tokens)" type="number" value={ni.cost} onChange={(e) => setNi({ ...ni, cost: e.target.value })} />
          <Input placeholder="Stock (blank = unlimited)" type="number" value={ni.stock} onChange={(e) => setNi({ ...ni, stock: e.target.value })} />
        </div>
        <ImageSettingControl
          label="Item image (optional)"
          value={ni.image_url}
          onChange={(url) => setNi({ ...ni, image_url: url ?? "" })}
          showFitControls={false}
          aspect="1 / 1"
          help="Upload from your device or paste a URL."
        />
        <Textarea rows={2} placeholder="Description (optional)" value={ni.description} onChange={(e) => setNi({ ...ni, description: e.target.value })} />
        <Button className="btn-luxury" onClick={addItem}><Plus className="h-4 w-4 mr-1" />Add item</Button>
      </Card>

      <div>
        <div className="font-bold text-sm mb-2">Items</div>
        <div className="grid sm:grid-cols-2 gap-2">
          {items.map((it) => (
            <Card key={it.id} className="p-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{it.name}</div>
                <div className="text-xs text-muted-foreground">{Number(it.cost).toLocaleString()} tokens{it.stock !== null ? ` · ${it.stock} left` : " · ∞"}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Switch checked={!!it.is_active} onCheckedChange={(v) => setItemActive(it.id, v)} />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => delItem(it.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </Card>
          ))}
          {items.length === 0 && <div className="text-xs text-muted-foreground">No items yet.</div>}
        </div>
      </div>

      <div>
        <div className="font-bold text-sm mb-2">Orders placed by users</div>
        <div className="space-y-2">
          {orders.length === 0 && <div className="text-xs text-muted-foreground">No orders yet.</div>}
          {orders.map((o) => (
            <Card key={o.id} className="p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold text-sm truncate">{o.shop_items?.name ?? "Item"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {profiles[o.user_id]?.ingame_name || profiles[o.user_id]?.full_name || "User"} · {Number(o.cost).toLocaleString()} tokens · {new Date(o.created_at).toLocaleString()}
                  </div>
                </div>
                <Badge variant="outline" className={`capitalize ${statusColor(o.status)}`}>{o.status}</Badge>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => setStatus(o.id, "approved")}>Approve</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => setStatus(o.id, "fulfilled")}>Accept / Fulfil</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" onClick={() => setStatus(o.id, "declined")}>Decline</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] text-sky-300" disabled={o.status === "refunded"} onClick={() => refund(o.id)}>Refund</Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- FAQ */
export function FaqAdminPanel() {
  const [faqs, setFaqs] = useState<any[]>([]);
  const [nf, setNf] = useState({ question: "", answer: "", category: "General", sort_order: "0" });

  async function load() {
    const { data } = await sb.from("faqs").select("*").order("sort_order");
    setFaqs(data ?? []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!nf.question.trim() || !nf.answer.trim()) return toast.error("Question and answer required");
    const { error } = await sb.from("faqs").insert({
      question: nf.question, answer: nf.answer, category: nf.category || "General",
      sort_order: Number(nf.sort_order) || 0, is_active: true,
    });
    if (error) return toast.error(error.message);
    setNf({ question: "", answer: "", category: "General", sort_order: "0" }); toast.success("FAQ added"); load();
  }
  async function setActive(id: string, is_active: boolean) { await sb.from("faqs").update({ is_active }).eq("id", id); load(); }
  async function del(id: string) { if (!confirm("Delete this FAQ?")) return; await sb.from("faqs").delete().eq("id", id); load(); }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2 font-bold text-sm"><LifeBuoy className="h-4 w-4 text-primary" />Add help article</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <Input placeholder="Question" value={nf.question} onChange={(e) => setNf({ ...nf, question: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Category" value={nf.category} onChange={(e) => setNf({ ...nf, category: e.target.value })} />
            <Input placeholder="Order" type="number" value={nf.sort_order} onChange={(e) => setNf({ ...nf, sort_order: e.target.value })} />
          </div>
        </div>
        <Textarea rows={3} placeholder="Answer" value={nf.answer} onChange={(e) => setNf({ ...nf, answer: e.target.value })} />
        <Button className="btn-luxury" onClick={add}><Plus className="h-4 w-4 mr-1" />Add FAQ</Button>
      </Card>
      <div className="space-y-2">
        {faqs.map((f) => (
          <Card key={f.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-primary">{f.category || "General"}</div>
                <div className="font-semibold">{f.question}</div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-0.5">{f.answer}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Switch checked={!!f.is_active} onCheckedChange={(v) => setActive(f.id, v)} />
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => del(f.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          </Card>
        ))}
        {faqs.length === 0 && <div className="text-xs text-muted-foreground">No FAQs yet.</div>}
      </div>
    </div>
  );
}
