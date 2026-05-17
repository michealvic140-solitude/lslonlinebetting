import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, UserCog, Bell, ChevronRight } from "lucide-react";
import { PushNotifSettings } from "@/components/UserHubSections";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — LSL" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-extrabold tracking-wide">Settings</h1>
            <p className="text-xs text-muted-foreground">Manage your account preferences</p>
          </div>
        </div>

        <section>
          <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3 flex items-center gap-2">
            <Bell className="h-3 w-3" /> Notifications
          </h2>
          <PushNotifSettings />
        </section>

        <section>
          <h2 className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3 flex items-center gap-2">
            <UserCog className="h-3 w-3" /> Account
          </h2>
          <Card className="p-4 backdrop-blur-xl bg-card/60">
            <Link to="/profile" className="flex items-center justify-between hover:bg-muted/40 rounded-md px-2 py-3 transition">
              <div>
                <div className="font-semibold text-sm">Profile details</div>
                <div className="text-xs text-muted-foreground">Name, avatar, gang, contact info</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </Card>
        </section>
      </div>
    </Layout>
  );
}
