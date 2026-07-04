import { supabase } from "@/integrations/supabase/client";
import { notifyAction, humanizeAction } from "@/lib/notify-action";

// High-frequency actions that should NOT trigger a pop-out (they fire on every
// keystroke / increment and would spam the admin with dialogs).
const SILENT_ACTIONS = new Set([
  "match_live_score",
  "match_presence",
]);

/** Shared admin audit logger — records an action into audit_logs via RPC. */
export async function logAudit(action: string, target_type: string, target_id?: string, metadata?: any) {
  const u = (await supabase.auth.getUser()).data.user;
  if (!u) return;
  const enriched: any = {
    ...(metadata ?? {}),
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    route: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
    origin: typeof window !== "undefined" ? window.location.origin : null,
    locale: typeof navigator !== "undefined" ? navigator.language : null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    source: "admin_panel",
  };
  if (target_type === "user" && target_id) enriched.target_user_id = target_id;
  const { error } = await (supabase as any).rpc("admin_log_action", {
    _action: action,
    _target_type: target_type,
    _target_id: target_id ?? null,
    _metadata: enriched,
  });
  if (error) console.warn("audit log failed", error.message);
  else if (!SILENT_ACTIONS.has(action)) {
    notifyAction("Action saved", humanizeAction(action));
  }
}
