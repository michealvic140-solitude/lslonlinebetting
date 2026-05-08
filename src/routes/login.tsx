import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — Lomita Shooters League" }] }),
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) nav({ to: "/dashboard", replace: true });
  }, [user, nav]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back!");
    // Hard navigate to ensure auth state is hydrated everywhere
    window.location.href = "/dashboard";
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-md">
        <Card className="p-8 backdrop-blur-xl bg-card/60 border-primary/30">
          <h1 className="text-3xl font-bold text-primary mb-1">Sign In</h1>
          <p className="text-sm text-muted-foreground mb-6">Enter the arena</p>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Password</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Signing in..." : "Sign In"}</Button>
          </form>
          <div className="mt-4 flex justify-between text-sm">
            <Link to="/register" className="text-primary hover:underline">Create account</Link>
            <Link to="/forgot-password" className="text-muted-foreground hover:underline">Forgot password?</Link>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
