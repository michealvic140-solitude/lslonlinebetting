// AI admin features disabled in this build.
import { createServerFn } from "@tanstack/react-start";

export const adminAiChat = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as any)
  .handler(async () => ({ reply: "AI assistant is disabled in this build." }));
