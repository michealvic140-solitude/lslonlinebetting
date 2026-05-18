import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generateVapidKeyPair() {
  const kp = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const rawPub = await crypto.subtle.exportKey("raw", kp.publicKey);
  return {
    publicKey: b64url(rawPub),
    privateKey: jwk.d as string, // already base64url
  };
}

export const generateVapidKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { userId, supabase } = context;
      const { data: isAdminRes } = await supabase.rpc("is_admin", { _user_id: userId });
      if (!isAdminRes) return { error: "Admin only" };
      const pair = await generateVapidKeyPair();
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
        note: "Public key saved. Paste the private key into the VAPID_PRIVATE_KEY secret.",
      };
    } catch (e: any) {
      console.error("generateVapidKeys failed", e);
      return { error: e?.message || "Failed to generate VAPID keys" };
    }
  });