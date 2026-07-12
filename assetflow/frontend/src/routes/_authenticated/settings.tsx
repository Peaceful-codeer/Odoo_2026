import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { auth, org } from "@/lib/api";
import { useSession } from "@/lib/auth/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, profile, roles, loading } = useSession();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (profile) { setFullName(profile.full_name ?? ""); setAvatarUrl(profile.avatar_url ?? ""); }
  }, [profile]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not signed in");
      await org.updateEmployee(Number(user.id), { name: fullName.trim() });   // admin-only endpoint; others see a friendly error
    },
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePw = useMutation({
    mutationFn: async () => {
      if (password.length < 8) throw new Error("Use at least 8 characters");
      if (!user?.email) throw new Error("Not signed in");
      await auth.forgot(user.email);
      throw new Error("Password reset link sent to your email — use it to set the new password.");
    },
    onSuccess: () => { toast.success("Password updated"); setPassword(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const initials = (fullName || profile?.email || "?").slice(0, 2).toUpperCase();

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Profile & Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your identity and access.</p>
      </header>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-4">
          <Avatar className="size-16">
            <AvatarImage src={avatarUrl || undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{profile?.email}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {roles.map((r) => (
                <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {r.replace("_", " ")}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Avatar URL</Label><Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" /></div>
        </div>
        <div className="flex justify-end"><Button variant="hero" onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending}>{saveProfile.isPending ? "Saving…" : "Save profile"}</Button></div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Change password</h2>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">New password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
        <div className="flex justify-end"><Button variant="outline" onClick={() => changePw.mutate()} disabled={changePw.isPending || !password}>{changePw.isPending ? "Updating…" : "Update password"}</Button></div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Session</h2>
        <p className="mt-2 text-xs text-muted-foreground">Signed in as {profile?.email}</p>
        <Button variant="outline" className="mt-4" onClick={async () => { auth.logout(); }}>Sign out</Button>
      </section>
    </div>
  );
}
