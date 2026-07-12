import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { auth } from "@/lib/api";
import { AssetFlowLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({ meta: [{ title: "Reset password — AssetFlow" }, { name: "robots", content: "noindex" }] }),
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await auth.forgot(email);
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send reset link");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-surface p-6">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-8 shadow-elevated">
        <AssetFlowLogo />
        <div>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the email tied to your account and we'll send a reset link.
          </p>
        </div>
        {sent ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-success/10 p-4 text-sm text-foreground">
              Check your inbox — we sent a reset link to <strong>{email}</strong>.
            </div>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button variant="hero" size="lg" type="submit" disabled={submitting} className="w-full">
              {submitting ? "Sending…" : "Send reset link"}
            </Button>
            <div className="text-center text-sm">
              <Link to="/auth" className="text-primary hover:underline">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
