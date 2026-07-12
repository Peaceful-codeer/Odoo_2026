import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, Info } from "lucide-react";
import { auth, isLoggedIn } from "@/lib/api";
import { AssetFlowLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const searchSchema = z.object({
  mode: z.enum(["login", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — AssetFlow" },
      { name: "description", content: "Sign in or create an AssetFlow account." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function AuthPage() {
  const { mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<"login" | "signup">(initialMode ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedIn()) navigate({ to: "/dashboard", replace: true });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        await auth.signup(fullName, email, password);   // Employee account only
        await auth.login(email, password);
        toast.success("Account created — welcome to AssetFlow");
      } else {
        await auth.login(email, password);
        toast.success("Welcome back");
      }
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen bg-gradient-surface lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-gradient-primary p-12 text-primary-foreground lg:flex">
        <AssetFlowLogo className="[&_span]:text-primary-foreground [&_.text-primary]:text-primary-foreground/80" />
        <div className="space-y-4">
          <h2 className="text-4xl font-bold leading-tight">
            Track every asset.
            <br />
            Book every resource.
          </h2>
          <p className="max-w-md text-lg text-primary-foreground/80">
            The operations platform your team has been quietly reinventing in spreadsheets. Retire the sheet.
          </p>
        </div>
        <div className="flex gap-6 text-sm text-primary-foreground/70">
          <span>Registration</span>
          <span>Allocations</span>
          <span>Booking</span>
          <span>Audits</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <AssetFlowLogo />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "login"
                ? "Sign in to continue to your workspace."
                : "Get started in less than a minute."}
            </p>
          </div>

          {mode === "signup" && (
            <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
              <Info className="size-4 shrink-0 text-primary" />
              <p>
                You'll be set up as an <strong>Employee</strong>. Roles (Admin, Asset Manager, Department Head) are assigned by your Admin.
              </p>
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  required
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Priya Sharma"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "login" && (
                  <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                    Forgot?
                  </Link>
                )}
              </div>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <Button variant="hero" size="lg" type="submit" disabled={submitting} className="w-full">
              {submitting ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Sign up" : "Log in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
