import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({ component: ProfilePage });

function ProfilePage() {
  const { user, profile, refresh } = useAuth();
  const [f, setF] = useState({ full_name: "", phone: "", discord_username: "", country: "", gang_name: "" });
  useEffect(() => { if (profile) setF({ full_name: profile.full_name, phone: profile.phone ?? "", discord_username: profile.discord_username ?? "", country: profile.country ?? "", gang_name: profile.gang_name ?? "" }); }, [profile?.id]);
  if (!user || !profile) return <Layout><div className="container mx-auto p-10">Sign in</div></Layout>;
  const save = async () => {
    const { error } = await supabase.from("profiles").update(f).eq("id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Saved"); await refresh();
  };
  return (
    <Layout>
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <h1 className="text-3xl font-bold text-primary mb-6">Your Profile</h1>
        <Card className="p-6 space-y-4">
          {(["full_name","phone","discord_username","country","gang_name"] as const).map((k) => (
            <div key={k}><Label className="capitalize">{k.replace("_"," ")}</Label><Input value={(f as any)[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} /></div>
          ))}
          <Button onClick={save} className="w-full">Save</Button>
        </Card>
      </div>
    </Layout>
  );
}
