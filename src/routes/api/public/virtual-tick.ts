import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public heartbeat for the virtual engine. Safe to call from any
// uptime monitor / cron; it only invokes the SECURITY DEFINER
// `virtual_tick` RPC which already enforces its own rules.
export const Route = createFileRoute("/api/public/virtual-tick")({
  server: {
    handlers: {
      GET: async () => {
        const { data, error } = await supabaseAdmin.rpc("virtual_tick");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, result: data }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
      POST: async () => {
        const { data, error } = await supabaseAdmin.rpc("virtual_tick");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500, headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, result: data }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
