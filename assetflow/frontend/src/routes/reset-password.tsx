import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { auth } from "@/lib/api";
import { AssetFlowLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({ meta: [{ title: "Set new password — AssetFlow" }, { name: "robots", content: "noindex" }] }),
});

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setSubmitting(true);
    try {
      const token = new URLSearchParams(window.location.search).get("token") ?? "";
      if (!token) throw new Error("Missing reset token — use the link from your email");
      await auth.reset(token, password);
      toast.success("Password updated");
      navigate({ to: "/auth", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-surface p-6">
      <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-8 shadow-elevated">
        <AssetFlowLogo />
        <div>
          <h1 className="text-2xl font-bold">Set a new password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose something you'll remember.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input id="password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input id="confirm" type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <Button variant="hero" size="lg" type="submit" disabled={submitting} className="w-full">
            {submitting ? "Saving…" : "Update password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
