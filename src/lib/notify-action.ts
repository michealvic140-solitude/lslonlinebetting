/**
 * Fire a global "action confirmed" event that the <ActionConfirmDialog />
 * (mounted in the admin console) listens for and renders as a pop-out
 * confirmation dialog. Call this after any successful save/action.
 */
export function notifyAction(title: string, description?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("admin:action-confirmed", { detail: { title, description } }),
  );
}

/** Turn an audit action code like "match_settled" into "Match settled". */
export function humanizeAction(action: string): string {
  const s = action.replace(/[_-]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}