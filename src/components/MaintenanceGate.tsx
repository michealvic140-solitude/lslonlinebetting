import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Crosshair, Lock } from "lucide-react";

export function MaintenanceGate({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const [s, setS] = useState<{ on: boolean; msg: string; img: string | null; closed: boolean; closedMsg: string; closedImg: string | null } | null>(null);

  useEffect(() => {
    (supabase as any).from("app_settings").select("maintenance_mode,maintenance_message,maintenance_image,closed_mode,closed_message,closed_image").eq("id", 1).maybeSingle()
      .then(({ data }: any) => setS({
        on: !!data?.maintenance_mode,
        msg: data?.maintenance_message ?? "We are performing maintenance.",
        img: data?.maintenance_image ?? null,
        closed: !!data?.closed_mode,
        closedMsg: data?.closed_message ?? "The website is currently closed. Please check back later.",
        closedImg: data?.closed_image ?? null,
      }));
    const ch = supabase.channel("settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, (p: any) =>
        setS({
          on: !!p.new?.maintenance_mode,
          msg: p.new?.maintenance_message ?? "",
          img: p.new?.maintenance_image ?? null,
          closed: !!p.new?.closed_mode,
          closedMsg: p.new?.closed_message ?? "",
          closedImg: p.new?.closed_image ?? null,
        }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (s?.closed && !isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="max-w-4xl w-full text-center space-y-4">
          {s.closedImg ? (
            <img src={s.closedImg} alt="Website closed" className="mx-auto w-full max-w-full max-h-[85vh] object-contain rounded-2xl border-2 border-amber-400/50 shadow-[0_0_40px_-10px_rgba(212,175,55,0.55)]" />
          ) : (
            <Lock className="h-14 w-14 text-primary mx-auto animate-pulse-glow" />
          )}
          <h1 className="text-3xl font-bold gradient-gold-text">Website closed</h1>
          <p className="text-muted-foreground">{s.closedMsg}</p>
        </div>
      </div>
    );
  }

  if (s?.on && !isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="max-w-4xl w-full text-center space-y-4">
          {s.img ? (
            <img src={s.img} alt="Down for maintenance" className="mx-auto w-full max-w-full max-h-[85vh] object-contain rounded-2xl border-2 border-amber-400/50 shadow-[0_0_40px_-10px_rgba(212,175,55,0.55)]" />
          ) : (
            <Crosshair className="h-14 w-14 text-primary mx-auto animate-pulse-glow" />
          )}
          <h1 className="text-3xl font-bold gradient-gold-text">Down for maintenance</h1>
          <p className="text-muted-foreground">{s.msg}</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
