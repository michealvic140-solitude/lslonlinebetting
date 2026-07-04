import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(400).optional().default(""),
  link: z.string().trim().max(500).optional().default(""),
  role: z.string().trim().optional().default("any"),
  locale: z.string().trim().max(40).optional().default(""),
  lastActiveDays: z.number().int().positive().max(3650).nullable().optional(),
  // ISO datetime string; when present in the future the push is scheduled.
  scheduledFor: z.string().trim().max(40).optional().default(""),
});

const audienceSchema = z.object({
  role: z.string().trim().optional().default("any"),
  locale: z.string().trim().max(40).optional().default(""),
  lastActiveDays: z.number().int().positive().max(3650).nullable().optional(),
}).optional().default({});

type Audience = z.infer<typeof audienceSchema>;

async function assertAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  return userId as string;
}

/**
 * Admin-only: send a web-push notification now, or schedule it for later.
 */
export const broadcastPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => schema.parse(data))
  .handler(async ({ data, context }) => {
    const userId = await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Scheduling: store for the cron processor and return early.
    const when = data.scheduledFor ? new Date(data.scheduledFor) : null;
    if (when && !isNaN(when.getTime()) && when.getTime() > Date.now() + 30_000) {
      const { error } = await supabaseAdmin.from("scheduled_pushes").insert({
        title: data.title,
        body: data.body || "",
        link: data.link || "/",
        role: data.role || "any",
        locale: data.locale || "",
        last_active_days: data.lastActiveDays ?? null,
        scheduled_for: when.toISOString(),
        status: "pending",
        created_by: userId,
      } as any);
      if (error) return { ok: false, sent: 0, total: 0, error: error.message };
      return { ok: true, scheduled: true, scheduledFor: when.toISOString(), sent: 0, total: 0 };
    }

    // Immediate send.
    const { getAudienceSubscriptions, configureWebPush, sendToSubscriptions } = await import("@/lib/push-send.server");
    const webpush = (await import("web-push")).default;

    const configured = await configureWebPush(webpush, supabaseAdmin);
    if (!configured) return { ok: false, sent: 0, total: 0, error: "VAPID keys not configured." };

    const subs = await getAudienceSubscriptions(supabaseAdmin, data as Audience);
    const { sent, removed, total } = await sendToSubscriptions(webpush, supabaseAdmin, subs, {
      title: data.title,
      body: data.body,
      link: data.link,
    });

    await supabaseAdmin.from("broadcasts").insert({
      title: data.title,
      body: data.body || "",
      link: data.link || "",
      segment: "push",
      sent_count: sent,
      created_by: userId,
    });

    return { ok: true, sent, removed, total };
  });

export const getPushSubscriberCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => audienceSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getAudienceSubscriptions } = await import("@/lib/push-send.server");
    const subs = await getAudienceSubscriptions(supabaseAdmin, data as Audience);
    return { count: subs.length };
  });

/** Admin-only: list scheduled + recently sent push blasts. */
export const listScheduledPushes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("scheduled_pushes")
      .select("id, title, body, link, role, locale, last_active_days, scheduled_for, status, sent_count, total_count, error, sent_at, created_at")
      .order("scheduled_for", { ascending: true })
      .limit(50);
    return { items: data ?? [] };
  });

/** Admin-only: cancel a pending scheduled push. */
export const cancelScheduledPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("scheduled_pushes")
      .update({ status: "cancelled" } as any)
      .eq("id", data.id)
      .eq("status", "pending");
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });
