import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Props {
  entityType: "match" | "team" | "player";
  entityId: string;
  className?: string;
}

export function WatchlistStar({ entityType, entityId, className = "" }: Props) {
  const { user } = useAuth();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const valid = UUID_RE.test(entityId);

  useEffect(() => {
    if (!user || !valid) return;
    supabase.from("watchlist").select("id")
      .eq("user_id", user.id).eq("entity_type", entityType).eq("entity_id", entityId)
      .maybeSingle().then(({ data }) => setOn(!!data));
  }, [user?.id, entityType, entityId, valid]);

  if (!user || !valid) return null;

  async function toggle(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    if (busy || !user) return;
    setBusy(true);
    if (on) {
      const { error } = await supabase.from("watchlist").delete()
        .eq("user_id", user.id).eq("entity_type", entityType).eq("entity_id", entityId);
      if (error) toast.error(error.message); else { setOn(false); toast.success("Removed from watchlist"); }
    } else {
      const { error } = await supabase.from("watchlist").insert({ user_id: user.id, entity_type: entityType, entity_id: entityId });
      if (error) toast.error(error.message); else { setOn(true); toast.success("Added to watchlist"); }
    }
    setBusy(false);
  }

  return (
    <button onClick={toggle} className={`p-1.5 rounded-md hover:bg-secondary/60 transition ${className}`} aria-label={on ? "Remove from watchlist" : "Add to watchlist"}>
      <Star className={`h-4 w-4 ${on ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
    </button>
  );
}
