import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { LEGACY_PROFILES, LEGACY_ROLES } from "./legacy-seed-data";

/**
 * Admin-only: recreates legacy user login accounts (email confirmed) and restores
 * their profile data so the original members can use "forgot password" to regain access.
 */
export const seedLegacyUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // authorize: caller must be an admin
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Response("Admin only", { status: 403 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let created = 0, restored = 0, skipped = 0, rolesSet = 0;
    const errors: string[] = [];

    for (const p of LEGACY_PROFILES) {
      const email = p.email?.trim().toLowerCase();
      if (!email) continue;
      try {
        // create the auth account (confirmed) so forgot-password works
        const { error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          password: crypto.randomUUID() + "Aa1!",
          user_metadata: { full_name: p.full_name || email.split("@")[0] },
        });
        if (createErr) {
          if (/already|registered|exists/i.test(createErr.message)) skipped++;
          else { errors.push(`${email}: ${createErr.message}`); continue; }
        } else {
          created++;
        }

        // restore profile data (matched by email; trigger created the profile row)
        const gangType = p.gang_type === "G" || p.gang_type === "F" ? p.gang_type : null;
        const { error: upErr } = await supabaseAdmin
          .from("profiles")
          .update({
            full_name: p.full_name || null,
            phone: p.phone || null,
            discord_username: p.discord_username || null,
            country: p.country || null,
            gang_name: p.gang_name || null,
            gang_type: gangType as any,
            ingame_name: p.ingame_name || null,
            token_balance: p.token_balance || 0,
            xp: p.xp || 0,
            vip_tier: p.vip_tier || "bronze",
          } as any)
          .eq("email", email);
        if (upErr) errors.push(`${email} profile: ${upErr.message}`);
        else restored++;
      } catch (e: any) {
        errors.push(`${email}: ${e?.message ?? "unknown error"}`);
      }
    }

    // restore special roles
    for (const r of LEGACY_ROLES) {
      const email = r.email?.trim().toLowerCase();
      const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("email", email).maybeSingle();
      if (!prof?.id) continue;
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: prof.id, role: r.role as any }, { onConflict: "user_id,role", ignoreDuplicates: true });
      if (!roleErr) rolesSet++;
    }

    return { created, restored, skipped, rolesSet, total: LEGACY_PROFILES.length, errors: errors.slice(0, 10) };
  });