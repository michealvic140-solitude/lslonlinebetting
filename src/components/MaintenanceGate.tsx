import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Crosshair } from "lucide-react";

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const [s, setS] = useState<{ on: boolean; msg: string } | null>(null);

  useEffect(() => {
    supabase.from("app_settings").select("maintenance_mode,maintenance_message").eq("id", 1).maybeSingle()
      .then(({ data }) => setS({ on: !!data?.maintenance_mode, msg: data?.maintenance_message ?? "We are performing maintenance." }));
    const ch = supabase.channel("settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, (p: any) =>
        setS({ on: !!p.new?.maintenance_mode, msg: p.new?.maintenance_message ?? "" }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (s?.on && !isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="max-w-md text-center space-y-4">
          <Crosshair className="h-14 w-14 text-primary mx-auto animate-pulse-glow" />
          <h1 className="text-3xl font-bold gradient-gold-text">Down for maintenance</h1>
          <p className="text-muted-foreground">{s.msg}</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
