import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

type ChatMsg = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string };

const ALLOWED_MODELS = new Set([
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
  "openai/gpt-5-mini",
  "openai/gpt-5",
]);

const SYSTEM_PROMPT = `You are the LSL Admin AI Copilot — a trusted super-admin assistant for the Lomita Shooters League betting platform.
You have full administrative tools:
- Users: search/inspect users, credit or debit tokens, ban/unban, mute/unmute, kick, grant/revoke roles, adjust XP, award achievements, notify a single user.
- Bets: list a user's bets, refund, void, suspend, unsuspend, or delete bets.
- Requests: list pending token top-ups and withdrawals, approve/deny token requests (approval credits tokens) and withdrawals, review virtual payout requests.
- Matches: list teams/categories/matches, create teams, seed/create matches with odds, change match status, update or settle scores, feature/unfeature, and archive matches.
- Platform: read platform health (P&L, risk, pending queues), per-match risk exposure, broadcast notifications, start/stop the virtual match cycle, clear the leaderboard, and read recent audit logs.

Rules:
- Always identify the exact target user with search_users or get_user before performing a destructive or balance-changing action. Never guess a user_id. Use list_user_bets to find a bet_id before any bet action, and list_pending_requests to find a request_id.
- Before creating a match, resolve both teams with list_teams (or create_team if missing) so you pass real team ids. Use list_matches to find a match_id before updating/settling/archiving.
- For token/XP/ban/mute/role/refund actions, only act when the admin's intent is clear. If ambiguous, ask a clarifying question instead of acting.
- For destructive actions (delete bet, clear leaderboard), confirm the admin's intent before executing unless they were already explicit.
- Always include a clear human reason for moderation and token actions.
- After taking actions, briefly confirm what you did with concrete numbers (e.g. new balance).
- Be concise and professional. Format with short markdown when helpful.`;

// OpenAI-style tool schema exposed to the model.
const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_users",
      description: "Search platform users by name, email, Discord username/full name, or gang. Returns up to 10 matches with id, balance, status.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Search text" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user",
      description: "Get full details for one user by id, including token balance, roles, ban/mute status, XP, and Discord info.",
      parameters: { type: "object", properties: { user_id: { type: "string" } }, required: ["user_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_tokens",
      description: "Credit (positive) or debit (negative) a user's token balance. Logs the change automatically.",
      parameters: { type: "object", properties: { user_id: { type: "string" }, amount: { type: "number", description: "Positive to credit, negative to debit" }, reason: { type: "string" } }, required: ["user_id", "amount", "reason"] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_ban",
      description: "Ban or unban a user.",
      parameters: { type: "object", properties: { user_id: { type: "string" }, banned: { type: "boolean" }, reason: { type: "string" } }, required: ["user_id", "banned"] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_mute",
      description: "Mute or unmute a user (blocks chat).",
      parameters: { type: "object", properties: { user_id: { type: "string" }, muted: { type: "boolean" }, reason: { type: "string" } }, required: ["user_id", "muted"] },
    },
  },
  {
    type: "function",
    function: {
      name: "kick_user",
      description: "Force-logout a user's active sessions.",
      parameters: { type: "object", properties: { user_id: { type: "string" }, reason: { type: "string" } }, required: ["user_id", "reason"] },
    },
  },
  {
    type: "function",
    function: {
      name: "adjust_xp",
      description: "Add or subtract XP for a user.",
      parameters: { type: "object", properties: { user_id: { type: "string" }, delta: { type: "number" }, reason: { type: "string" } }, required: ["user_id", "delta"] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_role",
      description: "Grant or revoke a platform role for a user.",
      parameters: { type: "object", properties: { user_id: { type: "string" }, role: { type: "string", enum: ["viewer", "shooter", "gang_leader", "registered", "sponsor", "moderator", "admin"] }, grant: { type: "boolean", description: "true to grant, false to revoke" } }, required: ["user_id", "role", "grant"] },
    },
  },
  {
    type: "function",
    function: {
      name: "refund_bet",
      description: "Refund a bet by its id (returns the stake to the user).",
      parameters: { type: "object", properties: { bet_id: { type: "string" }, reason: { type: "string" } }, required: ["bet_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "broadcast",
      description: "Send a notification to a segment of users. Segment: 'all', 'active', 'vip', or 'banned'.",
      parameters: { type: "object", properties: { title: { type: "string" }, body: { type: "string" }, link: { type: "string" }, segment: { type: "string" } }, required: ["title", "body"] },
    },
  },
  {
    type: "function",
    function: {
      name: "platform_health",
      description: "Get a platform health snapshot: user count, total circulating tokens, P&L and risk summaries, pending withdrawals and token requests.",
      parameters: { type: "object", properties: { days: { type: "number", description: "Window for P&L, default 30" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_user_bets",
      description: "List a user's most recent bets (id, stake, status, potential payout, created date). Use this to find a bet_id before refunding, voiding, suspending or deleting a bet.",
      parameters: { type: "object", properties: { user_id: { type: "string" }, limit: { type: "number", description: "Max bets, default 10" }, status: { type: "string", description: "Optional filter e.g. 'pending', 'won', 'lost'" } }, required: ["user_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "void_bet",
      description: "Void a bet by id. Optionally refund the stake to the user.",
      parameters: { type: "object", properties: { bet_id: { type: "string" }, refund: { type: "boolean", description: "Return the stake to the user, default false" }, reason: { type: "string" } }, required: ["bet_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "suspend_bet",
      description: "Suspend (freeze) a bet so it cannot settle until unsuspended.",
      parameters: { type: "object", properties: { bet_id: { type: "string" }, reason: { type: "string" } }, required: ["bet_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "unsuspend_bet",
      description: "Remove the suspension from a bet.",
      parameters: { type: "object", properties: { bet_id: { type: "string" } }, required: ["bet_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_bet",
      description: "Permanently delete a bet by id. Optionally refund the stake first. Destructive — confirm intent.",
      parameters: { type: "object", properties: { bet_id: { type: "string" }, refund: { type: "boolean", description: "Return the stake to the user before deleting, default false" }, reason: { type: "string" } }, required: ["bet_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "award_achievement",
      description: "Grant an achievement/badge to a user.",
      parameters: { type: "object", properties: { user_id: { type: "string" }, code: { type: "string", description: "Unique achievement code/slug" }, title: { type: "string" }, description: { type: "string" }, icon: { type: "string", description: "Optional emoji or icon name" } }, required: ["user_id", "code", "title"] },
    },
  },
  {
    type: "function",
    function: {
      name: "notify_user",
      description: "Send a direct notification to a single user.",
      parameters: { type: "object", properties: { user_id: { type: "string" }, title: { type: "string" }, body: { type: "string" }, link: { type: "string" } }, required: ["user_id", "title", "body"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_pending_requests",
      description: "List pending token top-up requests and withdrawal requests awaiting admin review.",
      parameters: { type: "object", properties: { kind: { type: "string", enum: ["tokens", "withdrawals", "both"], description: "Default 'both'" }, limit: { type: "number", description: "Max per kind, default 10" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "review_token_request",
      description: "Approve or deny a pending token top-up request by its id. Approving credits the requested tokens to the user.",
      parameters: { type: "object", properties: { request_id: { type: "string" }, approve: { type: "boolean" }, reason: { type: "string" } }, required: ["request_id", "approve"] },
    },
  },
  {
    type: "function",
    function: {
      name: "review_withdrawal",
      description: "Approve or deny a pending withdrawal request by its id.",
      parameters: { type: "object", properties: { request_id: { type: "string" }, approve: { type: "boolean" }, reason: { type: "string" } }, required: ["request_id", "approve"] },
    },
  },
  {
    type: "function",
    function: {
      name: "match_exposure",
      description: "Get the house's open risk exposure per match (potential payout liability). Useful to spot dangerous matches.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_virtual_cycle",
      description: "Start or stop the virtual matches cycle/engine.",
      parameters: { type: "object", properties: { running: { type: "boolean" } }, required: ["running"] },
    },
  },
  {
    type: "function",
    function: {
      name: "review_virtual_payout",
      description: "Approve or deny a virtual match payout request by its id.",
      parameters: { type: "object", properties: { request_id: { type: "string" }, approve: { type: "boolean" }, reason: { type: "string" } }, required: ["request_id", "approve"] },
    },
  },
  {
    type: "function",
    function: {
      name: "clear_leaderboard",
      description: "Wipe/reset all leaderboard overrides. Destructive — confirm intent.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "recent_audit_logs",
      description: "Read the most recent admin audit log entries (who did what, when).",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Default 15, max 50" }, action: { type: "string", description: "Optional action filter substring" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "list_teams",
      description: "List teams/gangs (id, name). Use this to find team ids before creating a match, or to check if a team already exists before creating one.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Optional name filter" }, limit: { type: "number", description: "Default 25, max 100" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "create_team",
      description: "Create a new team/gang. Returns the new team id. Reuse an existing team from list_teams when one already matches.",
      parameters: { type: "object", properties: { name: { type: "string" }, logo_url: { type: "string" }, gang_type: { type: "string" } }, required: ["name"] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_categories",
      description: "List match categories (id, name). Use to pick a category_id when creating a match.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_matches",
      description: "List matches (id, name, status, start time, scores, featured). Use to find a match_id before updating, settling, or archiving.",
      parameters: { type: "object", properties: { status: { type: "string", enum: ["scheduled", "live", "ended", "cancelled"] }, query: { type: "string", description: "Optional name filter" }, limit: { type: "number", description: "Default 15, max 50" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "create_match",
      description: "Create/seed a match between two teams, with a 'Match Winner' market and home/draw/away odds. Look up or create teams first with list_teams/create_team. Returns the new match id.",
      parameters: {
        type: "object",
        properties: {
          home_team_id: { type: "string" },
          away_team_id: { type: "string" },
          name: { type: "string", description: "Optional. Defaults to 'Home vs Away'." },
          start_time: { type: "string", description: "ISO datetime. Defaults to now." },
          location: { type: "string" },
          category_id: { type: "string" },
          featured: { type: "boolean", description: "Mark as featured, default false" },
          home_odds: { type: "number", description: "Decimal odds for home win, default 2.0" },
          draw_odds: { type: "number", description: "Decimal odds for a draw, default 3.0" },
          away_odds: { type: "number", description: "Decimal odds for away win, default 2.0" },
        },
        required: ["home_team_id", "away_team_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_match_status",
      description: "Change a match status: scheduled, live, ended, or cancelled.",
      parameters: { type: "object", properties: { match_id: { type: "string" }, status: { type: "string", enum: ["scheduled", "live", "ended", "cancelled"] } }, required: ["match_id", "status"] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_match_score",
      description: "Update the live score of a match without ending it.",
      parameters: { type: "object", properties: { match_id: { type: "string" }, home_score: { type: "number" }, away_score: { type: "number" } }, required: ["match_id", "home_score", "away_score"] },
    },
  },
  {
    type: "function",
    function: {
      name: "settle_match",
      description: "Finalize a match: set the final score, mark it ended, set the winning team, and close its betting markets.",
      parameters: { type: "object", properties: { match_id: { type: "string" }, home_score: { type: "number" }, away_score: { type: "number" }, winner: { type: "string", enum: ["home", "away", "draw"], description: "Who won; 'draw' leaves winner empty" } }, required: ["match_id", "home_score", "away_score", "winner"] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_match_featured",
      description: "Feature or unfeature a match on the homepage.",
      parameters: { type: "object", properties: { match_id: { type: "string" }, featured: { type: "boolean" } }, required: ["match_id", "featured"] },
    },
  },
  {
    type: "function",
    function: {
      name: "archive_match",
      description: "Archive a match so it no longer appears in active lists.",
      parameters: { type: "object", properties: { match_id: { type: "string" } }, required: ["match_id"] },
    },
  },
] as const;

export const adminAiChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { messages: { role: string; content: string }[]; model?: string })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;

    // Authorize: super-admin only.
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return { error: "Admin AI is restricted to super admins.", actions: [] };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { error: "AI is not configured (missing API key).", actions: [] };

    const model = data.model && ALLOWED_MODELS.has(data.model) ? data.model : "google/gemini-2.5-flash";

    // Tool executors — run as the authenticated admin (RLS + auth.uid() apply).
    const exec: Record<string, (args: any) => Promise<any>> = {
      async search_users({ query }) {
        const q = String(query ?? "").trim();
        const { data, error } = await supabase
          .from("profiles")
          .select("id, full_name, email, discord_username, discord_full_name, gang_name, token_balance, is_banned, is_muted, xp")
          .or(`full_name.ilike.%${q}%,email.ilike.%${q}%,discord_username.ilike.%${q}%,discord_full_name.ilike.%${q}%,gang_name.ilike.%${q}%`)
          .limit(10);
        if (error) throw new Error(error.message);
        return { count: data?.length ?? 0, users: data ?? [] };
      },
      async get_user({ user_id }) {
        const { data: p, error } = await supabase.from("profiles").select("*").eq("id", user_id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!p) throw new Error("User not found");
        const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user_id);
        return { ...p, roles: (roles ?? []).map((r: any) => r.role) };
      },
      async adjust_tokens({ user_id, amount, reason }) {
        const delta = Math.trunc(Number(amount));
        if (!delta) throw new Error("Amount must be a non-zero integer");
        const { data: p, error: e1 } = await supabase.from("profiles").select("token_balance, full_name").eq("id", user_id).maybeSingle();
        if (e1) throw new Error(e1.message);
        if (!p) throw new Error("User not found");
        const newBal = Number(p.token_balance ?? 0) + delta;
        if (newBal < 0) throw new Error("Balance cannot go negative");
        const { error } = await supabase.from("profiles").update({ token_balance: newBal }).eq("id", user_id);
        if (error) throw new Error(error.message);
        await supabase.from("notifications").insert({ user_id, title: delta > 0 ? "Tokens credited" : "Tokens debited", body: `${delta > 0 ? "+" : ""}${delta} tokens — ${reason ?? "admin adjustment"}` });
        await supabase.rpc("admin_log_action", { _action: delta > 0 ? "grant_tokens" : "revoke_tokens", _target_type: "user", _target_id: user_id, _metadata: { amount: delta, reason, balance_to: newBal, source: "admin_ai" } });
        return { user: p.full_name, delta, new_balance: newBal };
      },
      async set_ban({ user_id, banned, reason }) {
        const { error } = await supabase.from("profiles").update({ is_banned: !!banned, ban_reason: banned ? (reason ?? "Admin action") : null }).eq("id", user_id);
        if (error) throw new Error(error.message);
        await supabase.rpc("admin_log_action", { _action: banned ? "ban_user" : "unban_user", _target_type: "user", _target_id: user_id, _metadata: { reason, source: "admin_ai" } });
        return { user_id, banned: !!banned };
      },
      async set_mute({ user_id, muted, reason }) {
        const { error } = await supabase.from("profiles").update({ is_muted: !!muted, mute_reason: muted ? (reason ?? "Admin action") : null }).eq("id", user_id);
        if (error) throw new Error(error.message);
        await supabase.rpc("admin_log_action", { _action: muted ? "mute_user" : "unmute_user", _target_type: "user", _target_id: user_id, _metadata: { reason, source: "admin_ai" } });
        return { user_id, muted: !!muted };
      },
      async kick_user({ user_id, reason }) {
        const { error } = await supabase.rpc("admin_kick_user", { _user_id: user_id, _reason: reason ?? "Admin action" });
        if (error) throw new Error(error.message);
        return { user_id, kicked: true };
      },
      async adjust_xp({ user_id, delta, reason }) {
        const { error } = await supabase.rpc("admin_adjust_xp", { _user_id: user_id, _delta: Math.trunc(Number(delta)), _reason: reason ?? null });
        if (error) throw new Error(error.message);
        return { user_id, xp_delta: Math.trunc(Number(delta)) };
      },
      async set_role({ user_id, role, grant }) {
        if (grant) {
          const { error } = await supabase.from("user_roles").upsert({ user_id, role }, { onConflict: "user_id,role", ignoreDuplicates: true });
          if (error) throw new Error(error.message);
        } else {
          const { error } = await supabase.from("user_roles").delete().eq("user_id", user_id).eq("role", role);
          if (error) throw new Error(error.message);
        }
        await supabase.rpc("admin_log_action", { _action: grant ? "add_role" : "remove_role", _target_type: "user", _target_id: user_id, _metadata: { role, source: "admin_ai" } });
        return { user_id, role, granted: !!grant };
      },
      async refund_bet({ bet_id, reason }) {
        const { error } = await supabase.rpc("admin_refund_bet", { _bet_id: bet_id, _reason: reason ?? null });
        if (error) throw new Error(error.message);
        return { bet_id, refunded: true };
      },
      async broadcast({ title, body, link, segment }) {
        const { error } = await supabase.rpc("admin_broadcast", { _title: title, _body: body, _link: link ?? null, _segment: segment ?? "all" });
        if (error) throw new Error(error.message);
        return { sent: true, segment: segment ?? "all" };
      },
      async platform_health({ days }) {
        const [{ count: userCount }, { data: balances }, { data: pnl }, { data: risk }, { count: pendW }, { count: pendT }] = await Promise.all([
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("token_balance"),
          supabase.rpc("admin_pnl_summary", { _days: Math.trunc(Number(days ?? 30)) }),
          supabase.rpc("admin_risk_summary"),
          supabase.from("withdrawal_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
          supabase.from("token_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        ]);
        const circulating = (balances ?? []).reduce((a: number, x: any) => a + Number(x.token_balance ?? 0), 0);
        return { user_count: userCount ?? 0, circulating_tokens: circulating, pnl, risk, pending_withdrawals: pendW ?? 0, pending_token_requests: pendT ?? 0 };
      },
      async list_user_bets({ user_id, limit, status }) {
        let q = supabase
          .from("bets")
          .select("id, stake, status, potential_payout, created_at")
          .eq("user_id", user_id)
          .order("created_at", { ascending: false })
          .limit(Math.min(Math.max(Math.trunc(Number(limit ?? 10)), 1), 50));
        if (status) q = q.eq("status", String(status));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return { count: data?.length ?? 0, bets: data ?? [] };
      },
      async void_bet({ bet_id, refund, reason }) {
        const { error } = await supabase.rpc("admin_void_bet", { _bet_id: bet_id, _refund: !!refund, _reason: reason ?? null });
        if (error) throw new Error(error.message);
        return { bet_id, voided: true, refunded: !!refund };
      },
      async suspend_bet({ bet_id, reason }) {
        const { error } = await supabase.rpc("admin_suspend_bet", { _bet_id: bet_id, _reason: reason ?? null });
        if (error) throw new Error(error.message);
        return { bet_id, suspended: true };
      },
      async unsuspend_bet({ bet_id }) {
        const { error } = await supabase.rpc("admin_unsuspend_bet", { _bet_id: bet_id });
        if (error) throw new Error(error.message);
        return { bet_id, suspended: false };
      },
      async delete_bet({ bet_id, refund, reason }) {
        const { error } = await supabase.rpc("admin_delete_bet", { _bet_id: bet_id, _refund: !!refund, _reason: reason ?? null });
        if (error) throw new Error(error.message);
        return { bet_id, deleted: true, refunded: !!refund };
      },
      async award_achievement({ user_id, code, title, description, icon }) {
        const { error } = await supabase.rpc("admin_award_achievement", { _user_id: user_id, _code: code, _title: title, _description: description ?? null, _icon: icon ?? null });
        if (error) throw new Error(error.message);
        return { user_id, code, awarded: true };
      },
      async notify_user({ user_id, title, body, link }) {
        const { error } = await supabase.from("notifications").insert({ user_id, title, body, link: link ?? null });
        if (error) throw new Error(error.message);
        return { user_id, sent: true };
      },
      async list_pending_requests({ kind, limit }) {
        const k = kind ?? "both";
        const lim = Math.min(Math.max(Math.trunc(Number(limit ?? 10)), 1), 50);
        const out: any = {};
        if (k === "tokens" || k === "both") {
          const { data, error } = await supabase.from("token_requests").select("id, user_id, amount, note, status, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(lim);
          if (error) throw new Error(error.message);
          out.token_requests = data ?? [];
        }
        if (k === "withdrawals" || k === "both") {
          const { data, error } = await supabase.from("withdrawal_requests").select("id, user_id, ingame_name, gang_name, amount, ticket_ref, status, created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(lim);
          if (error) throw new Error(error.message);
          out.withdrawal_requests = data ?? [];
        }
        return out;
      },
      async review_token_request({ request_id, approve, reason }) {
        const { data: r, error: e0 } = await supabase.from("token_requests").select("*").eq("id", request_id).maybeSingle();
        if (e0) throw new Error(e0.message);
        if (!r) throw new Error("Token request not found");
        if (r.status !== "pending") throw new Error(`Request already ${r.status}`);
        if (approve) {
          const { data: p, error: e1 } = await supabase.from("profiles").select("token_balance").eq("id", r.user_id).maybeSingle();
          if (e1) throw new Error(e1.message);
          if (!p) throw new Error("User not found");
          const newBal = Number(p.token_balance ?? 0) + Number(r.amount);
          const { error: e2 } = await supabase.from("profiles").update({ token_balance: newBal }).eq("id", r.user_id);
          if (e2) throw new Error(e2.message);
          await supabase.from("token_requests").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", request_id);
          await supabase.from("notifications").insert({ user_id: r.user_id, title: "Tokens credited", body: `${Number(r.amount).toLocaleString()} tokens added to your account.` });
          await supabase.rpc("admin_log_action", { _action: "token_request_approved", _target_type: "token_request", _target_id: request_id, _metadata: { amount: r.amount, balance_to: newBal, source: "admin_ai" } });
          return { request_id, approved: true, amount: r.amount, new_balance: newBal };
        }
        await supabase.from("token_requests").update({ status: "denied", review_note: reason ?? null, reviewed_at: new Date().toISOString() }).eq("id", request_id);
        await supabase.from("notifications").insert({ user_id: r.user_id, title: "Token request denied", body: `Reason: ${reason ?? "—"}` });
        await supabase.rpc("admin_log_action", { _action: "token_request_denied", _target_type: "token_request", _target_id: request_id, _metadata: { reason, source: "admin_ai" } });
        return { request_id, approved: false };
      },
      async review_withdrawal({ request_id, approve, reason }) {
        const { data: r, error: e0 } = await supabase.from("withdrawal_requests").select("*").eq("id", request_id).maybeSingle();
        if (e0) throw new Error(e0.message);
        if (!r) throw new Error("Withdrawal request not found");
        if (r.status !== "pending") throw new Error(`Request already ${r.status}`);
        const status = approve ? "approved" : "denied";
        const { error } = await supabase.from("withdrawal_requests").update({ status, admin_note: reason ?? null, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", request_id);
        if (error) throw new Error(error.message);
        await supabase.from("notifications").insert({ user_id: r.user_id, title: approve ? "Withdrawal approved" : "Withdrawal denied", body: approve ? `Your withdrawal of ${Number(r.amount).toLocaleString()} is approved.` : `Reason: ${reason ?? "—"}` });
        await supabase.rpc("admin_log_action", { _action: approve ? "withdrawal_approved" : "withdrawal_denied", _target_type: "withdrawal_request", _target_id: request_id, _metadata: { amount: r.amount, reason, source: "admin_ai" } });
        return { request_id, approved: !!approve };
      },
      async match_exposure() {
        const { data, error } = await supabase.rpc("admin_exposure_per_match");
        if (error) throw new Error(error.message);
        return { matches: data ?? [] };
      },
      async set_virtual_cycle({ running }) {
        const { error } = await supabase.rpc("admin_set_virtual_cycle" as any, { _running: !!running });
        if (error) throw new Error(error.message);
        return { running: !!running };
      },
      async review_virtual_payout({ request_id, approve, reason }) {
        const { error } = await supabase.rpc("admin_review_virtual_payout" as any, { _id: request_id, _approve: !!approve, _reason: approve ? null : (reason ?? null) });
        if (error) throw new Error(error.message);
        return { request_id, approved: !!approve };
      },
      async clear_leaderboard() {
        const { error } = await supabase.rpc("admin_clear_leaderboard");
        if (error) throw new Error(error.message);
        return { cleared: true };
      },
      async recent_audit_logs({ limit, action }) {
        let q = supabase.from("audit_logs").select("action, target_type, target_id, metadata, created_at").order("created_at", { ascending: false }).limit(Math.min(Math.max(Math.trunc(Number(limit ?? 15)), 1), 50));
        if (action) q = q.ilike("action", `%${action}%`);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return { count: data?.length ?? 0, logs: data ?? [] };
      },
      async list_teams({ query, limit }) {
        let q = supabase.from("teams").select("id, name, gang_type").order("name").limit(Math.min(Math.max(Math.trunc(Number(limit ?? 25)), 1), 100));
        if (query) q = q.ilike("name", `%${query}%`);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return { count: data?.length ?? 0, teams: data ?? [] };
      },
      async create_team({ name, logo_url, gang_type }) {
        const { data, error } = await supabase.from("teams").insert({ name, logo_url: logo_url ?? null, gang_type: gang_type ?? null }).select("id, name").single();
        if (error) throw new Error(error.message);
        await supabase.rpc("admin_log_action", { _action: "team_created", _target_type: "team", _target_id: data.id, _metadata: { name, source: "admin_ai" } });
        return { team_id: data.id, name: data.name };
      },
      async list_categories() {
        const { data, error } = await supabase.from("categories").select("id, name").order("name");
        if (error) throw new Error(error.message);
        return { categories: data ?? [] };
      },
      async list_matches({ status, query, limit }) {
        let q = supabase.from("matches").select("id, name, status, start_time, home_score, away_score, is_featured, is_archived").order("start_time", { ascending: false }).limit(Math.min(Math.max(Math.trunc(Number(limit ?? 15)), 1), 50));
        if (status) q = q.eq("status", String(status));
        if (query) q = q.ilike("name", `%${query}%`);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return { count: data?.length ?? 0, matches: data ?? [] };
      },
      async create_match({ home_team_id, away_team_id, name, start_time, location, category_id, featured, home_odds, draw_odds, away_odds }) {
        if (home_team_id === away_team_id) throw new Error("Home and away teams must be different");
        const { data: teams, error: te } = await supabase.from("teams").select("id, name").in("id", [home_team_id, away_team_id]);
        if (te) throw new Error(te.message);
        const homeName = teams?.find((t: any) => t.id === home_team_id)?.name;
        const awayName = teams?.find((t: any) => t.id === away_team_id)?.name;
        if (!homeName || !awayName) throw new Error("One or both team ids were not found. Use list_teams or create_team first.");
        const { data: m, error } = await supabase.from("matches").insert({
          name: name || `${homeName} vs ${awayName}`,
          home_team_id, away_team_id,
          start_time: start_time ? new Date(start_time).toISOString() : new Date().toISOString(),
          location: location ?? null, status: "scheduled",
          category_id: category_id || null, is_featured: !!featured,
        }).select("id, name").single();
        if (error) throw new Error(error.message);
        const { data: market } = await supabase.from("markets").insert({ match_id: m.id, name: "Match Winner" }).select("id").single();
        if (market) {
          await supabase.from("odds").insert([
            { market_id: market.id, label: homeName, value: Number(home_odds ?? 2.0) },
            { market_id: market.id, label: "Draw", value: Number(draw_odds ?? 3.0) },
            { market_id: market.id, label: awayName, value: Number(away_odds ?? 2.0) },
          ]);
        }
        await supabase.rpc("admin_log_action", { _action: "match_created", _target_type: "match", _target_id: m.id, _metadata: { name: m.name, source: "admin_ai" } });
        return { match_id: m.id, name: m.name };
      },
      async set_match_status({ match_id, status }) {
        const { error } = await supabase.from("matches").update({ status: String(status) }).eq("id", match_id);
        if (error) throw new Error(error.message);
        await supabase.rpc("admin_log_action", { _action: "match_status_changed", _target_type: "match", _target_id: match_id, _metadata: { status, source: "admin_ai" } });
        return { match_id, status };
      },
      async set_match_score({ match_id, home_score, away_score }) {
        const hs = Math.trunc(Number(home_score)), as = Math.trunc(Number(away_score));
        const { error } = await supabase.from("matches").update({ home_score: hs, away_score: as }).eq("id", match_id);
        if (error) throw new Error(error.message);
        return { match_id, home_score: hs, away_score: as };
      },
      async settle_match({ match_id, home_score, away_score, winner }) {
        const hs = Math.trunc(Number(home_score)), as = Math.trunc(Number(away_score));
        const { data: mm, error: me } = await supabase.from("matches").select("home_team_id, away_team_id").eq("id", match_id).maybeSingle();
        if (me) throw new Error(me.message);
        if (!mm) throw new Error("Match not found");
        const winnerId = winner === "home" ? mm.home_team_id : winner === "away" ? mm.away_team_id : null;
        const { error } = await supabase.from("matches").update({ home_score: hs, away_score: as, status: "ended", winner_team_id: winnerId, settled_at: new Date().toISOString() }).eq("id", match_id);
        if (error) throw new Error(error.message);
        await supabase.from("markets").update({ is_open: false }).eq("match_id", match_id);
        await supabase.rpc("admin_log_action", { _action: "match_settled", _target_type: "match", _target_id: match_id, _metadata: { home_score: hs, away_score: as, winner, source: "admin_ai" } });
        return { match_id, home_score: hs, away_score: as, winner };
      },
      async set_match_featured({ match_id, featured }) {
        const { error } = await supabase.from("matches").update({ is_featured: !!featured }).eq("id", match_id);
        if (error) throw new Error(error.message);
        return { match_id, featured: !!featured };
      },
      async archive_match({ match_id }) {
        const { error } = await supabase.from("matches").update({ is_archived: true }).eq("id", match_id);
        if (error) throw new Error(error.message);
        await supabase.rpc("admin_log_action", { _action: "match_archived", _target_type: "match", _target_id: match_id, _metadata: { source: "admin_ai" } });
        return { match_id, archived: true };
      },
    };

    const convo: ChatMsg[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(data.messages ?? []).map((m) => ({ role: m.role as ChatMsg["role"], content: String(m.content ?? "") })),
    ];

    const actions: { name: string; args: any; result: any; error?: string }[] = [];

    try {
      for (let step = 0; step < 6; step++) {
        const res = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "X-Lovable-AIG-SDK": "raw",
          },
          body: JSON.stringify({ model, messages: convo, tools: TOOLS, tool_choice: "auto" }),
        });

        if (res.status === 429) return { error: "AI rate limit reached. Please wait a moment and try again.", actions };
        if (res.status === 402) return { error: "AI credits exhausted. Add credits in Settings → Workspace → Usage.", actions };
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          return { error: `AI request failed (${res.status}). ${t.slice(0, 200)}`, actions };
        }

        const json: any = await res.json();
        const msg = json?.choices?.[0]?.message;
        if (!msg) return { error: "AI returned an empty response.", actions };

        const toolCalls = msg.tool_calls ?? [];
        if (!toolCalls.length) {
          return { reply: msg.content ?? "(no reply)", actions };
        }

        // Record assistant turn with its tool calls, then execute each tool.
        convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
        for (const call of toolCalls) {
          const name = call.function?.name;
          let args: any = {};
          try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
          const fn = exec[name];
          if (!fn) {
            actions.push({ name, args, result: null, error: "Unknown tool" });
            convo.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ error: "Unknown tool" }) });
            continue;
          }
          try {
            const result = await fn(args);
            actions.push({ name, args, result });
            convo.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(result).slice(0, 4000) });
          } catch (e: any) {
            const error = e?.message ?? "Tool failed";
            actions.push({ name, args, result: null, error });
            convo.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ error }) });
          }
        }
      }
      return { reply: "Reached the maximum number of tool steps. Please refine your request.", actions };
    } catch (e: any) {
      return { error: e?.message ?? "AI request failed", actions };
    }
  });
