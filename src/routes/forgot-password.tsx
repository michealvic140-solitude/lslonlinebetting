import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";

export const Route = createFileRoute("/forgot-password")({
  component: () => {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) return toast.error(error.message);
      setSent(true); toast.success("Reset link sent!");
    };
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 max-w-md">
          <Card className="p-8 backdrop-blur-xl bg-card/60">
            <h1 className="text-2xl font-bold text-primary mb-4">Reset password</h1>
            {sent ? <p className="text-sm text-muted-foreground">Check your email.</p> : (
              <form onSubmit={submit} className="space-y-4">
                <Input type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Button type="submit" className="w-full">Send reset link</Button>
              </form>
            )}
            <p className="mt-4 text-sm"><Link to="/login" className="text-primary hover:underline">Back to sign in</Link></p>
          </Card>
        </div>
      </Layout>
    );
  },
});
