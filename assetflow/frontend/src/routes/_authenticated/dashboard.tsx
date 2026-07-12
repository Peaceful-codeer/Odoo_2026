import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Boxes, ArrowRightLeft, Wrench, CalendarClock, RefreshCw, AlertTriangle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dashboardApi, logsApi, assetsApi, userMap } from "@/lib/api";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const KPI_DEFS = [
  { key: "assets_available", label: "Available", tone: "text-success", icon: Boxes },
  { key: "assets_allocated", label: "Allocated", tone: "text-info", icon: ArrowRightLeft },
  { key: "maintenance_today", label: "Maintenance Today", tone: "text-warning", icon: Wrench },
  { key: "active_bookings", label: "Active Bookings", tone: "text-primary", icon: CalendarClock },
  { key: "pending_transfers", label: "Pending Transfers", tone: "text-muted-foreground", icon: RefreshCw },
  { key: "overdue_returns", label: "Overdue", tone: "text-destructive", icon: AlertTriangle },
] as const;

const DOTS = ["bg-success", "bg-warning", "bg-info", "bg-primary"];

function Dashboard() {
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 18 ? "Good afternoon" : "Good evening";

  const { data: dash, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: dashboardApi.get, refetchInterval: 30_000 });
  const { data: logs } = useQuery({ queryKey: ["activity-recent"], queryFn: () => logsApi.list(8).catch(() => []) });
  const { data: users } = useQuery({ queryKey: ["user-map"], queryFn: userMap });
  const { data: assets } = useQuery({ queryKey: ["assets-lite"], queryFn: () => assetsApi.list({ limit: 200 }) });

  const assetById = new Map((assets ?? []).map((a) => [a.id, a]));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="text-3xl font-bold tracking-tight">{greeting}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/assets">View assets</Link>
          </Button>
          <Button variant="hero" asChild>
            <Link to="/assets"><Plus className="size-4" /> Register asset</Link>
          </Button>
        </div>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {KPI_DEFS.map((k) => (
          <div key={k.key} className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</p>
              <k.icon className={cn("size-4", k.tone)} />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              {isLoading ? <Skeleton className="h-7 w-12" /> : (
                <span className="text-2xl font-bold tracking-tight text-foreground">{dash?.kpis?.[k.key] ?? 0}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Overdue */}
        <section className="rounded-2xl border border-border bg-card shadow-card lg:col-span-2">
          <header className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">Overdue returns</h2>
              <p className="text-xs text-muted-foreground">Immediate attention required</p>
            </div>
            <Link to="/allocations" className="text-xs font-medium text-primary hover:underline">View all →</Link>
          </header>
          <div className="divide-y divide-border">
            {(dash?.overdue_returns ?? []).length === 0 && (
              <p className="px-5 py-6 text-sm text-muted-foreground">No overdue returns 🎉</p>
            )}
            {(dash?.overdue_returns ?? []).map((row: any) => {
              const asset = assetById.get(row.asset_id);
              const holder = users?.get(row.holder_id);
              return (
                <div key={row.allocation_id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-secondary/40">
                  <div className="flex min-w-0 items-center gap-4">
                    <span className="font-mono text-xs text-muted-foreground">{asset?.asset_tag ?? `#${row.asset_id}`}</span>
                    <span className="truncate text-sm font-medium">{holder?.name ?? `User #${row.holder_id}`}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="hidden text-xs text-destructive sm:inline">
                      {new Date(row.expected_return_date).toLocaleDateString()} · {row.days_overdue}d
                    </span>
                    <span className="status-overdue rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Overdue</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Right column */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Quick actions</h2>
            <div className="mt-4 space-y-2">
              <Button variant="hero" className="w-full justify-start" asChild>
                <Link to="/assets"><Plus className="size-4" /> Register asset</Link>
              </Button>
              <Button variant="soft" className="w-full justify-start" asChild>
                <Link to="/booking"><CalendarClock className="size-4" /> Book resource</Link>
              </Button>
              <Button variant="outline" className="w-full justify-start" asChild>
                <Link to="/maintenance"><Wrench className="size-4" /> Raise maintenance</Link>
              </Button>
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <h2 className="text-sm font-semibold uppercase tracking-wide">Recent activity</h2>
            <ul className="mt-4 space-y-4">
              {(logs ?? []).length === 0 && <li className="text-sm text-muted-foreground">No recent activity</li>}
              {(logs ?? []).map((a, i) => (
                <li key={a.id} className="flex gap-3">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOTS[i % DOTS.length])} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-tight">{a.detail || a.action}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleString()}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
