import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Boxes,
  ArrowRightLeft,
  CalendarClock,
  Wrench,
  ClipboardCheck,
  BarChart3,
  Bell,
  Settings,
  Building2,
  LogOut,
  Search,
  Menu,
  Plus,
} from "lucide-react";
import { useState } from "react";
import { auth } from "@/lib/api";
import type { SessionState } from "@/lib/auth/use-session";
import { AssetFlowLogo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Array<"admin" | "asset_manager" | "dept_head" | "employee">;
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/organization", label: "Organization", icon: Building2, roles: ["admin"] },
  { to: "/assets", label: "Assets", icon: Boxes },
  { to: "/allocations", label: "Allocations", icon: ArrowRightLeft },
  { to: "/booking", label: "Booking", icon: CalendarClock },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/audits", label: "Audits", icon: ClipboardCheck },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/notifications", label: "Activity", icon: Bell },
];

function roleLabel(roles: string[]): string {
  if (roles.includes("admin")) return "Admin";
  if (roles.includes("asset_manager")) return "Asset Manager";
  if (roles.includes("dept_head")) return "Department Head";
  return "Employee";
}

export function AppShell({ children, session }: { children: React.ReactNode; session: SessionState }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const visibleNav = NAV.filter((n) => !n.roles || n.roles.some((r) => session.roles.includes(r)));
  const initials = (session.profile?.full_name || session.user?.email || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  async function signOut() {
    auth.logout();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar (desktop) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-transform md:relative md:flex md:translate-x-0",
          mobileOpen ? "flex translate-x-0" : "hidden -translate-x-full md:flex",
        )}
      >
        <div className="flex h-16 items-center px-6">
          <AssetFlowLogo />
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {visibleNav.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-card"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <Link
            to="/settings"
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <Settings className="size-4" /> Settings
          </Link>
          <button
            onClick={signOut}
            className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            <Menu className="size-5" />
          </Button>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Search assets, tags, people…"
              className="h-10 w-full rounded-full border border-input bg-secondary/60 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:bg-card focus:shadow-card"
            />
          </div>
          <div className="flex-1 md:hidden" />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="size-5" />
            </Button>
            <div className="flex items-center gap-2 rounded-full bg-secondary/60 py-1 pl-1 pr-3">
              <div className="grid size-8 place-items-center rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </div>
              <div className="hidden text-left leading-tight md:block">
                <p className="text-xs font-semibold">{session.profile?.full_name || session.user?.email}</p>
                <p className="text-[10px] text-muted-foreground">{roleLabel(session.roles)}</p>
              </div>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 pb-24 md:px-8 md:pb-6">{children}</main>
        <MobileFab />
      </div>
    </div>
  );
}

function MobileFab() {
  return (
    <Link
      to="/assets"
      aria-label="Register asset"
      className="fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform hover:scale-105 md:hidden"
    >
      <Plus className="size-6" />
    </Link>
  );
}
