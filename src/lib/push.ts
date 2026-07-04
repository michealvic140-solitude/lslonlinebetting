import { supabase } from "@/integrations/supabase/client";

export type PushState = "unsupported" | "default" | "granted" | "denied" | "subscribed";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function getVapidPublicKey(): Promise<string | null> {
  const { data } = await supabase
    .from("app_settings")
    .select("vapid_public_key")
    .eq("id", 1)
    .maybeSingle();
  return (data as any)?.vapid_public_key || null;
}

async function readLocalSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported() || Notification.permission !== "granted") return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

async function ensurePushSubscription(): Promise<{ sub: PushSubscription | null; error?: string }> {
  if (!pushSupported() || Notification.permission !== "granted") return { sub: null };
  const vapid = await getVapidPublicKey();
  if (!vapid) return { sub: null, error: "Push is not configured yet. Please try again later." };

  const existingReg = await navigator.serviceWorker.getRegistration();
  const reg = existingReg ?? await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource,
    });
  }
  return { sub };
}

async function saveSubscription(userId: string, sub: PushSubscription): Promise<{ ok: boolean; error?: string }> {
  const json: any = sub.toJSON();
  const endpoint = sub.endpoint;
  const p256dh = json?.keys?.p256dh ?? bufToBase64(sub.getKey("p256dh"));
  const auth_key = json?.keys?.auth ?? bufToBase64(sub.getKey("auth"));
  if (!endpoint || !p256dh || !auth_key) return { ok: false, error: "Could not read subscription keys." };

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth_key,
        locale: navigator.language || null,
        user_agent: navigator.userAgent.slice(0, 300),
        enabled: true,
        last_seen_at: new Date().toISOString(),
        disabled_at: null,
        failure_count: 0,
      } as any,
      { onConflict: "endpoint" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Current permission/subscription state for the UI. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "default") return "default";
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? "subscribed" : "granted";
  } catch {
    return "granted";
  }
}

/** Silently keeps an already-allowed device stored in the database. */
export async function syncExistingPushSubscription(userId: string): Promise<{ ok: boolean; error?: string; subscribed?: boolean }> {
  if (!pushSupported()) return { ok: false, error: "Notifications are not supported on this device/browser." };
  if (Notification.permission !== "granted") return { ok: true, subscribed: false };
  const ensured = await ensurePushSubscription();
  if (ensured.error) return { ok: false, error: ensured.error, subscribed: false };
  const sub = ensured.sub ?? await readLocalSubscription();
  if (!sub) return { ok: true, subscribed: false };
  const saved = await saveSubscription(userId, sub);
  return { ...saved, subscribed: saved.ok };
}

/**
 * Registers the service worker, requests permission, subscribes to push and
 * stores the subscription token in the database for the given user.
 */
export async function subscribeToPush(userId: string): Promise<{ ok: boolean; error?: string }> {
  if (!pushSupported()) return { ok: false, error: "Notifications are not supported on this device/browser." };

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "Permission was not granted." };

  const ensured = await ensurePushSubscription();
  if (ensured.error) return { ok: false, error: ensured.error };
  const sub = ensured.sub;
  if (!sub) return { ok: false, error: "Could not create a push subscription on this device." };

  return saveSubscription(userId, sub);
}

/** Removes the local subscription and disables it in the database. */
export async function unsubscribeFromPush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await supabase.from("push_subscriptions").update({ enabled: false }).eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {
    /* ignore */
  }
}