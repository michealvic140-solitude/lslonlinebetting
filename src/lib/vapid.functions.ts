import { createServerFn } from "@tanstack/react-start";
import webpush from "web-push";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const generateVapidKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { data: isAdminRes } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!isAdminRes) throw new Error("Admin only");
    const pair = webpush.generateVAPIDKeys();
    // Persist public key + a default subject so push delivery is wired up immediately.
    await supabaseAdmin
      .from("app_settings")
      .update({
        vapid_public_key: pair.publicKey,
        vapid_subject: "mailto:admin@lomitashootersleague.com",
      })
      .eq("id", 1);
    return {
      publicKey: pair.publicKey,
      privateKey: pair.privateKey,
      note: "Public key saved to app_settings. Paste the private key into the VAPID_PRIVATE_KEY secret.",
    };
  });