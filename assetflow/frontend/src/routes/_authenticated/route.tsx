import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { isLoggedIn } from "@/lib/api";
import { useSession } from "@/lib/auth/use-session";
import { AppShell } from "@/components/layout/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!isLoggedIn()) throw redirect({ to: "/auth" });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const session = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!session.loading && !session.session) navigate({ to: "/auth", replace: true });
  }, [session.loading, session.session, navigate]);

  if (session.loading || !session.session || !session.profile) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="text-sm text-muted-foreground">Loading workspace…</div>
      </div>
    );
  }
  return (
    <AppShell session={session}>
      <Outlet />
    </AppShell>
  );
}
