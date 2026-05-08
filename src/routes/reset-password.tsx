import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";

export const Route = createFileRoute("/reset-password")({
  component: () => {
    const [pw, setPw] = useState("");
    const nav = useNavigate();
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) return toast.error(error.message);
      toast.success("Password updated"); nav({ to: "/login" });
    };
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 max-w-md">
          <Card className="p-8 backdrop-blur-xl bg-card/60">
            <h1 className="text-2xl font-bold text-primary mb-4">New password</h1>
            <form onSubmit={submit} className="space-y-4">
              <Input type="password" required minLength={6} placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <Button type="submit" className="w-full">Update password</Button>
            </form>
          </Card>
        </div>
      </Layout>
    );
  },
});
