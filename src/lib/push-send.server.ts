// Server-only helpers for sending web-push blasts. Never import from client code.
export type Audience = {
  role?: string;
  locale?: string;
  lastActiveDays?: number | null;
};

export async function getAudienceSubscriptions(supabaseAdmin: any, audience: Audience) {
  let query = supabaseAdmin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth_key, locale, last_seen_at")
    .eq("enabled", true);

  const locale = audience.locale?.trim();
  if (locale) query = query.ilike("locale", `${locale.replace("_", "-")}%`);

  const { data: initial, error } = await query;
  if (error) throw error;
  let subs = (initial ?? []) as any[];
  const userIds = Array.from(new Set(subs.map((s) => s.user_id).filter(Boolean)));

  const role = audience.role && audience.role !== "any" ? audience.role : "";
  if (role) {
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", role)
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const allowed = new Set((roles ?? []).map((r: any) => r.user_id));
    subs = subs.filter((s) => allowed.has(s.user_id));
  }

  if (audience.lastActiveDays) {
    const since = new Date(Date.now() - audience.lastActiveDays * 24 * 60 * 60 * 1000).toISOString();
    const ids = Array.from(new Set(subs.map((s) => s.user_id).filter(Boolean)));
    const { data: sessions } = await supabaseAdmin
      .from("user_sessions")
      .select("user_id")
      .gte("last_seen", since)
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const active = new Set((sessions ?? []).map((s: any) => s.user_id));
    subs = subs.filter((s) => active.has(s.user_id));
  }

  return subs;
}

/** Configure web-push with the project's VAPID keys. Returns false if not configured. */
export async function configureWebPush(webpush: any, supabaseAdmin: any): Promise<boolean> {
  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("vapid_public_key")
    .eq("id", 1)
    .maybeSingle();
  const pub = (settings as any)?.vapid_public_key || process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  const { data: priv2 } = await supabaseAdmin
    .from("app_settings_private")
    .select("vapid_subject")
    .eq("id", 1)
    .maybeSingle();
  const subject = (priv2 as any)?.vapid_subject || "mailto:admin@example.com";
  webpush.setVapidDetails(subject, pub, priv);
  return true;
}

/** Sends a payload to a list of subscriptions, disabling dead endpoints. */
export async function sendToSubscriptions(
  webpush: any,
  supabaseAdmin: any,
  subs: any[],
  content: { title: string; body?: string; link?: string; tag?: string },
) {
  const payload = JSON.stringify({
    title: content.title,
    body: content.body || "",
    link: content.link || "/",
    tag: content.tag || "broadcast-" + Date.now(),
    requireInteraction: true,
  });
  let sent = 0;
  const dead: string[] = [];
  for (const s of subs ?? []) {
    const sub: any = s;
    if (!sub.endpoint?.startsWith("http")) continue;
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } } as any,
        payload,
      );
      sent++;
    } catch (err: any) {
      if (err?.statusCode === 410 || err?.statusCode === 404) dead.push(sub.id);
    }
  }
  if (dead.length) {
    await supabaseAdmin
      .from("push_subscriptions")
      .update({ enabled: false, disabled_at: new Date().toISOString() } as any)
      .in("id", dead);
  }
  return { sent, removed: dead.length, total: subs.length };
}
