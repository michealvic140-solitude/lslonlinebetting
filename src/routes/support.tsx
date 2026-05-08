import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LifeBuoy, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Support — LSL" }, { name: "description", content: "Get help from the LSL team." }] }),
  component: SupportPage,
});

function SupportPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!user) nav({ to: "/login" }); }, [user, nav]);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase.from("support_tickets").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setTickets(data ?? []);
  };
  useEffect(() => {
    load();
    if (!user) return;
    const ch = supabase.channel(`my-tickets-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);
  if (!user) return null;

  const create = async () => {
    if (!subject.trim() || !message.trim()) { toast.error("Subject and message required"); return; }
    setSubmitting(true);
    try {
      const { data: ticket, error } = await supabase.from("support_tickets").insert({ user_id: user.id, subject }).select().single();
      if (error) throw error;
      let imageUrl: string | null = null;
      if (imageFile) {
        const path = `${ticket.id}/${Date.now()}-${imageFile.name}`;
        const { error: ue } = await supabase.storage.from("ticket-uploads").upload(path, imageFile);
        if (!ue) imageUrl = supabase.storage.from("ticket-uploads").getPublicUrl(path).data.publicUrl;
      }
      await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, user_id: user.id, content: message, image_url: imageUrl });

      try {
        const { data: ai } = await supabase.functions.invoke("ai-support", { body: { subject, message } });
        if (ai?.reply) await supabase.from("ticket_messages").insert({ ticket_id: ticket.id, user_id: user.id, content: ai.reply, is_ai: true });
      } catch {/* non-fatal */}

      setSubject(""); setMessage(""); setImageFile(null);
      toast.success("Ticket created");
      nav({ to: "/ticket/$id", params: { id: ticket.id } });
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <Layout>
      <div className="container py-10 max-w-3xl">
        <h1 className="text-3xl font-bold gradient-gold-text flex items-center gap-2"><LifeBuoy className="h-6 w-6" />Support</h1>
        <p className="text-muted-foreground text-sm mt-1">Open a ticket and our AI assistant will reply instantly while a human reviews.</p>

        <Card className="glass-strong p-5 mt-6 space-y-3">
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Subject</label>
            <Input placeholder="What can we help with?" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Message</label>
            <Textarea rows={5} placeholder="Tell us what happened…" value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Attach screenshot (optional)</label>
            <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
            {imageFile && <p className="text-[10px] text-muted-foreground mt-1">{imageFile.name}</p>}
          </div>
          <Button className="btn-luxury w-full" disabled={submitting} onClick={create}>
            <Sparkles className="h-4 w-4 mr-1" />{submitting ? "Creating…" : "Create ticket + get instant AI reply"}
          </Button>
        </Card>

        <h2 className="font-bold mt-8 mb-3">Your tickets</h2>
        <div className="space-y-2">
          {tickets.length === 0 && <p className="text-muted-foreground text-sm">No tickets yet.</p>}
          {tickets.map((t) => (
            <Link key={t.id} to="/ticket/$id" params={{ id: t.id }} className="block">
              <Card className="glass p-3 flex items-center justify-between hover:border-primary/60 transition">
                <div className="min-w-0">
                  <div className="font-bold truncate">{t.subject}</div>
                  <div className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</div>
                </div>
                <Badge variant="outline" className="capitalize">{t.status}</Badge>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
