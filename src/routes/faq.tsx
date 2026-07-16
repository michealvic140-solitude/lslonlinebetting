import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LifeBuoy, Search } from "lucide-react";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "Help Center & FAQ | ECB" },
      { name: "description", content: "Find answers to frequently asked questions about the ECB platform, betting, tokens and games." },
    ],
  }),
  component: FaqPage,
});

function FaqPage() {
  const [faqs, setFaqs] = useState<any[]>([]);
  const [q, setQ] = useState("");
  useEffect(() => {
    (supabase as any).from("faqs").select("*").eq("is_active", true).order("sort_order").then(({ data }: any) => setFaqs(data ?? []));
  }, []);
  const filtered = faqs.filter((f) => !q || f.question.toLowerCase().includes(q.toLowerCase()) || (f.answer || "").toLowerCase().includes(q.toLowerCase()));
  const cats = Array.from(new Set(filtered.map((f) => f.category || "General")));
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-2xl bg-gradient-gold grid place-items-center shadow-gold"><LifeBuoy className="h-7 w-7 text-background" /></div>
          <div>
            <h1 className="text-3xl font-extrabold gradient-gold-text">Help Center</h1>
            <p className="text-sm text-muted-foreground">Answers to common questions.</p>
          </div>
        </div>
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help articles…" className="pl-9" />
        </div>
        {filtered.length === 0 && <Card className="p-8 text-center text-muted-foreground">No articles found.</Card>}
        {cats.map((cat) => (
          <div key={cat} className="mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wide text-primary mb-2">{cat}</h2>
            <Accordion type="single" collapsible className="space-y-2">
              {filtered.filter((f) => (f.category || "General") === cat).map((f) => (
                <AccordionItem key={f.id} value={f.id} className="border border-border rounded-lg px-4">
                  <AccordionTrigger className="text-left">{f.question}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground whitespace-pre-wrap">{f.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </div>
    </Layout>
  );
}