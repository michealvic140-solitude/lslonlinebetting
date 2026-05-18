import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Msg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
};

// Tool definitions — every admin RPC the AI is allowed to invoke.
const TOOLS: any[] = [
  {
    type: "function",
    function: {
      name: "get_risk_summary",
      description: "Get live risk snapshot: house balance, payouts paused flag, total open exposure, open bets count, pending withdrawals.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pnl_summary",
      description: "Get platform P&L over the last N days. Returns stakes_in, payouts_out, net, bets, wins.",
      parameters: { type: "object", properties: { days: { type: "integer", minimum: 1, maximum: 365 } }, required: ["days"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exposure_per_match",
      description: "Top 30 matches with biggest open exposure.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "find_user",
      description: "Search profiles by name, in-game name, email or discord. Returns up to 10 users with id, ingame_name, full_name, email, token_balance, is_banned, is_muted, vip_tier.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "find_bet",
      description: "Look up a bet by tracking_id or UUID. Returns full bet record.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "broadcast",
      description: "Send a platform-wide notification. Segment is one of: all, vip, admins.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          link: { type: "string" },
          segment: { type: "string", enum: ["all", "vip", "admins"] },
        },
        required: ["title", "segment"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_xp",
      description: "Add or subtract XP from a user. Use a negative delta to remove.",
      parameters: {
        type: "object",
        properties: { user_id: { type: "string" }, delta: { type: "integer" }, reason: { type: "string" } },
        required: ["user_id", "delta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "credit_tokens",
      description: "Credit (positive amount) or debit (negative) a user's token balance directly. Always include a reason.",
      parameters: {
        type: "object",
        properties: { user_id: { type: "string" }, amount: { type: "integer" }, reason: { type: "string" } },
        required: ["user_id", "amount", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_user_ban",
      description: "Ban or unban a user. Pass banned=true to ban, false to unban. Include reason when banning.",
      parameters: {
        type: "object",
        properties: { user_id: { type: "string" }, banned: { type: "boolean" }, reason: { type: "string" } },
        required: ["user_id", "banned"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_user_mute",
      description: "Mute or unmute a user from chat.",
      parameters: {
        type: "object",
        properties: { user_id: { type: "string" }, muted: { type: "boolean" }, reason: { type: "string" } },
        required: ["user_id", "muted"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suspend_bet",
      description: "Suspend a bet ticket (status -> suspended).",
      parameters: { type: "object", properties: { bet_id: { type: "string" }, reason: { type: "string" } }, required: ["bet_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "unsuspend_bet",
      description: "Re-open a suspended bet ticket.",
      parameters: { type: "object", properties: { bet_id: { type: "string" } }, required: ["bet_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "refund_bet",
      description: "Refund the stake of a bet ticket to the user.",
      parameters: { type: "object", properties: { bet_id: { type: "string" }, reason: { type: "string" } }, required: ["bet_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "void_bet",
      description: "Mark a bet void. Optionally refund the stake.",
      parameters: {
        type: "object",
        properties: { bet_id: { type: "string" }, refund: { type: "boolean" }, reason: { type: "string" } },
        required: ["bet_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_house_paused",
      description: "Pause or resume all payouts from the house wallet.",
      parameters: {
        type: "object",
        properties: { paused: { type: "boolean" }, reason: { type: "string" } },
        required: ["paused"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "house_adjust",
      description: "Manually credit (positive) or debit (negative) the house wallet. Reason is required.",
      parameters: {
        type: "object",
        properties: { amount: { type: "integer" }, reason: { type: "string" } },
        required: ["amount", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "review_withdrawal",
      description: "Approve or decline a pending withdrawal request.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" }, approve: { type: "boolean" }, note: { type: "string" } },
        required: ["id", "approve"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "approve_promo_request",
      description: "Approve a pending promo code request; generates a code and notifies the requester.",
      parameters: { type: "object", properties: { id: { type: "string" }, note: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "decline_promo_request",
      description: "Decline a pending promo code request.",
      parameters: { type: "object", properties: { id: { type: "string" }, note: { type: "string" } }, required: ["id"] },
    },
  },
];

async function execTool(supabase: any, name: string, args: any): Promise<any> {
  switch (name) {
    case "get_risk_summary": {
      const { data, error } = await supabase.rpc("admin_risk_summary");
      if (error) throw error;
      return data;
    }
    case "get_pnl_summary": {
      const { data, error } = await supabase.rpc("admin_pnl_summary", { _days: args.days ?? 30 });
      if (error) throw error;
      return data;
    }
    case "get_exposure_per_match": {
      const { data, error } = await supabase.rpc("admin_exposure_per_match");
      if (error) throw error;
      return data;
    }
    case "find_user": {
      const q = String(args.query ?? "").trim();
      if (!q) return { users: [] };
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, ingame_name, email, discord_username, token_balance, is_banned, is_muted, vip_tier, xp")
        .or(`full_name.ilike.%${q}%,ingame_name.ilike.%${q}%,email.ilike.%${q}%,discord_username.ilike.%${q}%`)
        .limit(10);
      if (error) throw error;
      return { users: data };
    }
    case "find_bet": {
      const id = String(args.id ?? "").trim();
      const isUuid = /^[0-9a-f-]{36}$/i.test(id);
      const { data, error } = await supabase
        .from("bets")
        .select("*")
        .or(isUuid ? `id.eq.${id}` : `tracking_id.eq.${id}`)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return { bet: data };
    }
    case "broadcast": {
      const { data, error } = await supabase.rpc("admin_broadcast", {
        _title: args.title, _body: args.body ?? "", _link: args.link ?? "", _segment: args.segment ?? "all",
      });
      if (error) throw error;
      return data;
    }
    case "adjust_xp": {
      const { data, error } = await supabase.rpc("admin_adjust_xp", { _user_id: args.user_id, _delta: args.delta, _reason: args.reason ?? null });
      if (error) throw error;
      return data;
    }
    case "credit_tokens": {
      const { data: p, error: pe } = await supabase
        .from("profiles").select("token_balance").eq("id", args.user_id).maybeSingle();
      if (pe) throw pe;
      const next = Number(p?.token_balance ?? 0) + Number(args.amount);
      if (next < 0) throw new Error("Resulting balance would be negative");
      const { error } = await supabase.from("profiles").update({ token_balance: next }).eq("id", args.user_id);
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: args.user_id,
        title: args.amount > 0 ? "Tokens credited" : "Tokens debited",
        body: `${args.amount > 0 ? "+" : ""}${args.amount} tokens · ${args.reason}`,
      });
      return { new_balance: next };
    }
    case "set_user_ban": {
      const patch: any = { is_banned: !!args.banned, ban_reason: args.banned ? (args.reason ?? null) : null };
      const { error } = await supabase.from("profiles").update(patch).eq("id", args.user_id);
      if (error) throw error;
      return { ok: true };
    }
    case "set_user_mute": {
      const patch: any = { is_muted: !!args.muted, mute_reason: args.muted ? (args.reason ?? null) : null };
      const { error } = await supabase.from("profiles").update(patch).eq("id", args.user_id);
      if (error) throw error;
      return { ok: true };
    }
    case "suspend_bet": {
      const { error } = await supabase.rpc("admin_suspend_bet", { _bet_id: args.bet_id, _reason: args.reason ?? null });
      if (error) throw error; return { ok: true };
    }
    case "unsuspend_bet": {
      const { error } = await supabase.rpc("admin_unsuspend_bet", { _bet_id: args.bet_id });
      if (error) throw error; return { ok: true };
    }
    case "refund_bet": {
      const { error } = await supabase.rpc("admin_refund_bet", { _bet_id: args.bet_id, _reason: args.reason ?? null });
      if (error) throw error; return { ok: true };
    }
    case "void_bet": {
      const { error } = await supabase.rpc("admin_void_bet", { _bet_id: args.bet_id, _refund: !!args.refund, _reason: args.reason ?? null });
      if (error) throw error; return { ok: true };
    }
    case "set_house_paused": {
      const { error } = await supabase.rpc("house_set_paused", { _paused: !!args.paused, _reason: args.reason ?? null });
      if (error) throw error; return { ok: true };
    }
    case "house_adjust": {
      const { data, error } = await supabase.rpc("house_manual_adjust", { _amount: args.amount, _reason: args.reason });
      if (error) throw error; return data;
    }
    case "review_withdrawal": {
      const { error } = await supabase.rpc("review_withdrawal_request", { _id: args.id, _approve: !!args.approve, _note: args.note ?? null });
      if (error) throw error; return { ok: true };
    }
    case "approve_promo_request": {
      const { data, error } = await supabase.rpc("approve_promo_request", { _id: args.id, _note: args.note ?? null });
      if (error) throw error; return { promo_id: data };
    }
    case "decline_promo_request": {
      const { error } = await supabase.rpc("decline_promo_request", { _id: args.id, _note: args.note ?? null });
      if (error) throw error; return { ok: true };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const adminAiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { messages: Msg[]; model?: string }) => input)
  .handler(async ({ data, context }) => {
    try {
    const { supabase, userId } = context;
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Admin only");

    const { data: settings } = await supabase
      .from("app_settings").select("admin_ai_enabled, admin_ai_model").eq("id", 1).maybeSingle();
    if (settings && (settings as any).admin_ai_enabled === false) throw new Error("Admin AI is disabled");
    const model = data.model || (settings as any)?.admin_ai_model || "google/gemini-2.5-flash";
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");

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
      content: `You are LSL Admin Copilot, a senior operator embedded in the Lomita Shooters League admin console.
You have FULL admin power through the provided tools and may execute any of them on behalf of the signed-in admin.

Operating principles:
- Whenever the admin asks for facts (users, bets, risk, P&L, exposure), call the appropriate read tool — never invent numbers.
- For destructive or financial actions (ban, mute, refund/void/suspend, credit tokens, broadcast, house adjust, withdrawal review, promo approve/decline), explain what you are about to do in one short sentence, then call the tool. Confirm only if the admin's request is ambiguous.
- Resolve users and bets by searching first (find_user, find_bet) when only a name / tracking id is given.
- Always include a clear "reason" string when a tool supports it — it lands in the audit log.

Reply formatting (CRITICAL — the admin sees only your final message, not raw tool output):
- Write a polished, professional executive summary in clean Markdown. Never paste raw JSON, function names, or code blocks at the user.
- Open with a one-line headline, then organized sections with **bold** labels and bullet points.
- Format every token amount with thousands separators (e.g. 11,906,755 tokens) and call out anything risky, anomalous, or requiring attention in its own "⚠️ Watch" section.
- When you report numbers, briefly interpret them ("house is healthy", "no pending withdrawals — nothing to action", etc.). Always close with a short "Recommended next steps" list when relevant.
- Be detailed but skim-friendly. Aim for substance over brevity, but no fluff.

Live snapshot (just fetched): ${JSON.stringify(snapshot)}`,
    };

    const conversation: Msg[] = [system, ...data.messages];
    const actions: { name: string; args: any; result: any; error?: string }[] = [];

    // Tool-call loop, max 8 rounds
    for (let round = 0; round < 8; round++) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: conversation, tools: TOOLS, tool_choice: "auto" }),
      });
      if (!res.ok) {
        const text = await res.text();
        if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment.");
        if (res.status === 402) throw new Error("AI credits required. Add credits in Lovable workspace.");
        throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
      }
      const json: any = await res.json();
      const msg = json?.choices?.[0]?.message;
      if (!msg) throw new Error("Empty AI response");

      const toolCalls = msg.tool_calls ?? [];
      conversation.push({ role: "assistant", content: msg.content ?? null, tool_calls: toolCalls.length ? toolCalls : undefined });

      if (!toolCalls.length) {
        return { reply: msg.content ?? "", snapshot, actions };
      }

      for (const call of toolCalls) {
        const name = call.function?.name;
        let args: any = {};
        try { args = call.function?.arguments ? JSON.parse(call.function.arguments) : {}; } catch { args = {}; }
        let result: any; let errorMsg: string | undefined;
        try { result = await execTool(supabase, name, args); }
        catch (e: any) { errorMsg = e?.message ?? String(e); result = { error: errorMsg }; }
        actions.push({ name, args, result, error: errorMsg });
        await supabase.from("audit_logs").insert({
          actor_id: userId, action: `ai_tool:${name}`, target_type: "ai", metadata: { args, result, error: errorMsg ?? null },
        });
        conversation.push({
          role: "tool", tool_call_id: call.id, name,
          content: JSON.stringify(result).slice(0, 8000),
        });
      }
    }

    return { reply: "Reached max tool-call rounds. Please ask a more specific question.", snapshot, actions };
    } catch (e: any) {
      const message = e?.message ?? String(e);
      console.error("adminAiChat error:", message, e);
      return { reply: "", snapshot: null as any, actions: [], error: message };
    }
  });
