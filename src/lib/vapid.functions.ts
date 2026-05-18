import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

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
  .handler(async () => {
    try {
      const authHeader = getRequestHeader("authorization");
      const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
      if (!token) return { error: "Please sign in as an admin before generating VAPID keys." };

      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) return { error: "Backend auth is not configured." };

      const supabase = createClient<Database>(url, key, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claims?.claims?.sub) return { error: "Your admin session expired. Please sign in again." };

      const { data: isAdminRes } = await supabase.rpc("is_admin", { _user_id: claims.claims.sub });
      if (!isAdminRes) return { error: "Admin only" };
      const pair = await generateVapidKeyPair();
      const { error: saveError } = await supabaseAdmin
        .from("app_settings")
        .update({
          vapid_public_key: pair.publicKey,
          vapid_subject: "mailto:admin@lomitashootersleague.com",
        })
        .eq("id", 1);
      if (saveError) return { error: saveError.message };
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