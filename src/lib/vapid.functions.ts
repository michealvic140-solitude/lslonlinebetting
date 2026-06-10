// Push/VAPID disabled in this build.
import { createServerFn } from "@tanstack/react-start";

export const generateVapidKeys = createServerFn({ method: "POST" })
  .handler(async () => ({
    publicKey: "",
    privateKey: "",
    disabled: true as const,
  }));
