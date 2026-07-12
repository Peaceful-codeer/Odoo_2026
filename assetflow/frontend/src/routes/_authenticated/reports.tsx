import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Boxes, Wrench, ArrowRightLeft, CalendarClock, AlertTriangle } from "lucide-react";
import { assetsApi, allocationsApi, maintenanceApi, bookingsApi, org, reportsApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const [assets, cats, depts, allocs, maint, bookings] = await Promise.all([
        assetsApi.list({ limit: 200 }), org.categories(), org.departments(),
        allocationsApi.list(), maintenanceApi.list(), bookingsApi.list(),
      ]);
      const cm = new Map(cats.map((c) => [c.id, c.name]));
      const dm = new Map(depts.map((d) => [d.id, d.name]));
      return {
        assets: assets.map((a) => ({
          id: a.id, status: a.status, purchase_cost: a.acquisition_cost,
          category: { name: cm.get(a.category_id) ?? null },
          department: { name: a.owner_department_id != null ? dm.get(a.owner_department_id) ?? null : null },
        })),
        allocs: allocs.map((a) => ({ id: a.id, status: a.status, expected_return: a.expected_return_date, allocated_at: a.allocated_at })),
        maint: maint.map((m) => ({ id: m.id, status: m.status === "resolved" ? "completed" : m.status, cost: null, created_at: m.created_at, priority: m.priority })),
        bookings: bookings.map((b) => ({ id: b.id, status: b.status === "upcoming" || b.status === "ongoing" ? "confirmed" : b.status })),
      };
    },
  });

  const exportCsv = () => { void reportsApi.download("csv"); };   // server-generated export (CSV/Excel/PDF supported)

  if (isLoading || !data) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const total = data.assets.length;
  const inUse = data.assets.filter((a) => a.status === "allocated" || a.status === "reserved").length;
  const utilization = total ? Math.round((inUse / total) * 100) : 0;
  const overdue = data.allocs.filter((a) => a.expected_return && new Date(a.expected_return) < new Date() && a.status !== "returned").length;
  const openMaint = data.maint.filter((m) => m.status !== "completed" && m.status !== "rejected").length;
  const maintCost = data.maint.reduce((s, m) => s + Number(m.cost ?? 0), 0);
  const activeBookings = data.bookings.filter((b) => b.status === "confirmed").length;
  const totalValue = data.assets.reduce((s, a) => s + Number(a.purchase_cost ?? 0), 0);

  const byCategory = groupCount(data.assets, (a) => a.category?.name ?? "Uncategorized");
  const byDepartment = groupCount(data.assets, (a) => a.department?.name ?? "Unassigned");
  const byStatus = groupCount(data.assets, (a) => a.status);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Utilization, spend, and workload across the organization.</p>
        </div>
        <Button variant="outline" onClick={exportCsv}><Download className="size-4" /> Export CSV</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi icon={Boxes} label="Utilization" value={`${utilization}%`} tone="text-primary" />
        <Kpi icon={AlertTriangle} label="Overdue" value={overdue} tone="text-destructive" />
        <Kpi icon={Wrench} label="Open maintenance" value={openMaint} tone="text-warning" />
        <Kpi icon={CalendarClock} label="Active bookings" value={activeBookings} tone="text-info" />
        <Kpi icon={ArrowRightLeft} label="Portfolio value" value={`$${Math.round(totalValue).toLocaleString()}`} tone="text-success" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <BarCard title="Assets by status" data={byStatus} />
        <BarCard title="Assets by category" data={byCategory} />
        <BarCard title="Assets by department" data={byDepartment} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Maintenance spend</h2>
        <p className="mt-2 text-3xl font-bold tracking-tight">${Math.round(maintCost).toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">Total across {data.maint.length} tickets</p>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string | number; tone: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={cn("size-4", tone)} />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function BarCard({ title, data }: { title: string; data: Array<[string, number]> }) {
  const max = Math.max(1, ...data.map((d) => d[1]));
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="mt-4 space-y-2">
        {data.length === 0 && <p className="text-xs text-muted-foreground">No data yet.</p>}
        {data.map(([label, count]) => (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="capitalize">{label}</span>
              <span className="font-mono text-muted-foreground">{count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${(count / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupCount<T>(items: T[], key: (t: T) => string): Array<[string, number]> {
  const map = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}
