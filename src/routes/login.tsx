import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in — Lomita Shooters League" },
      { name: "description", content: "Sign in to your Lomita Shooters League account to place bets, track your tickets, and follow your gang." },
      { property: "og:title", content: "Sign in — Lomita Shooters League" },
      { property: "og:description", content: "Sign in to place bets, track tickets, and follow your gang at LSL." },
      { property: "og:url", content: "https://lslonlinebetting.lovable.app/login" },
    ],
    links: [{ rel: "canonical", href: "https://lslonlinebetting.lovable.app/login" }],
  }),
  validateSearch: (s: Record<string, unknown>): { banned?: number } => {
    return s.banned === "1" || s.banned === 1 ? { banned: 1 } : {};
  },
  component: LoginPage,
});

function LoginPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { banned } = useSearch({ from: "/login" });
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
        {banned && (
          <Card className="mb-6 p-5 backdrop-blur-2xl bg-destructive/10 border-destructive/40">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-destructive/20 grid place-items-center shrink-0">
                <ShieldAlert className="h-5 w-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-destructive">Your account has been banned</h2>
                <p className="text-xs text-muted-foreground mt-1">You can submit an appeal to our moderation team for review.</p>
                <Link to="/support" className="inline-block mt-3 text-xs px-3 py-1.5 rounded-md bg-destructive/20 text-destructive border border-destructive/40 hover:bg-destructive/30 transition">Submit Appeal →</Link>
              </div>
            </div>
          </Card>
        )}
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
