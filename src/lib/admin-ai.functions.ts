import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export const adminAiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: Msg[]; model?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // verify admin
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Admin only");

    const { data: settings } = await supabase
      .from("app_settings")
      .select("admin_ai_enabled, admin_ai_model")
      .eq("id", 1)
      .maybeSingle();
    if (settings && (settings as any).admin_ai_enabled === false) {
      throw new Error("Admin AI is disabled");
    }
    const model = data.model || (settings as any)?.admin_ai_model || "google/gemini-2.5-flash";
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

    // Pull a compact platform snapshot to ground the AI
    const [pCount, openBets, pendingTok, pendingWd, openTickets, riskRpc] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("bets").select("id", { count: "exact", head: true }).eq("status", "open"),
      supabase.from("token_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("support_tickets").select("id", { count: "exact", head: true }).neq("status", "closed"),
      supabase.rpc("admin_risk_summary"),
    ]);

    const snapshot = {
      users: pCount.count ?? 0,
      open_bets: openBets.count ?? 0,
      pending_token_requests: pendingTok.count ?? 0,
      pending_withdrawals: pendingWd.count ?? 0,
      open_tickets: openTickets.count ?? 0,
      risk: riskRpc.data ?? null,
    };

    const system: Msg = {
      role: "system",
      content: `You are LSL Admin Copilot, an expert assistant inside the Lomita Shooters League admin console.
You help moderators with: moderation decisions, fraud heuristics, payout sanity checks, broadcasts copywriting, analytics interpretation, and SQL/data questions.
Be concise, action-oriented, and use bullet points. Never invent numbers — if you do not have data, ask for it.
Live platform snapshot (just fetched): ${JSON.stringify(snapshot)}`,
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [system, ...data.messages] }),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment.");
      if (res.status === 402) throw new Error("AI credits required. Add credits in Lovable workspace.");
      throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
    }
    const json: any = await res.json();
    const reply = json?.choices?.[0]?.message?.content ?? "";
    return { reply, snapshot };
  });