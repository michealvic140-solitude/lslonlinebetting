import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Forbidden");
  return userId as string;
}

export const listRecurringPushes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("recurring_push_settings")
      .select("*")
      .order("sort_order", { ascending: true });
    return { items: data ?? [] };
  });

const updateSchema = z.object({
  key: z.string().min(1).max(64),
  enabled: z.boolean().optional(),
  title: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().max(400).optional(),
  link: z.string().trim().max(500).optional(),
  hour_utc: z.number().int().min(0).max(23).nullable().optional(),
  start_hour_utc: z.number().int().min(0).max(23).optional(),
  end_hour_utc: z.number().int().min(0).max(23).optional(),
  next_index: z.number().int().min(0).optional(),
});

export const updateRecurringPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { key, ...patch } = data;
    const { error } = await supabaseAdmin
      .from("recurring_push_settings")
      .update(patch as any)
      .eq("key", key);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

/** Send a single reminder immediately (bypasses slot gate). */
export const triggerRecurringPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ key: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("recurring_push_settings")
      .select("*")
      .eq("key", data.key)
      .maybeSingle();
    if (!row) return { ok: false, error: "Reminder not found." };

    const { configureWebPush, getAudienceSubscriptions, sendToSubscriptions } = await import("@/lib/push-send.server");
    const webpush = (await import("web-push")).default;
    const configured = await configureWebPush(webpush, supabaseAdmin);
    if (!configured) return { ok: false, error: "VAPID keys not configured." };

    let body: string = (row as any).body || "";
    let nextIndex = (row as any).next_index ?? 0;
    if ((row as any).cycles_content) {
      const kind = (row as any).cycles_content;
      const { count } = await supabaseAdmin
        .from("motivational_content")
        .select("id", { count: "exact", head: true })
        .eq("kind", kind);
      const total = count ?? 0;
      if (total > 0) {
        const idx = (((row as any).next_index ?? 0) % total + total) % total;
        const { data: entry } = await supabaseAdmin
          .from("motivational_content")
          .select("text")
          .eq("kind", kind)
          .eq("idx", idx)
          .maybeSingle();
        if (entry?.text) body = entry.text;
        nextIndex = (idx + 1) % total;
      }
    }

    const subs = await getAudienceSubscriptions(supabaseAdmin, { role: "any" });
    const { sent, total } = await sendToSubscriptions(webpush, supabaseAdmin, subs, {
      title: (row as any).title,
      body,
      link: (row as any).link || "/",
      tag: `recurring-manual-${data.key}-${Date.now()}`,
    });
    await supabaseAdmin
      .from("recurring_push_settings")
      .update({ last_sent_at: new Date().toISOString(), next_index: nextIndex } as any)
      .eq("key", data.key);
    return { ok: true, sent, total };
  });
