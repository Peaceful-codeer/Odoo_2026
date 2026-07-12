import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Boxes, Package, Wrench, FileText, Calendar, DollarSign, MapPin, Hash } from "lucide-react";
import { assetsApi, org, userMap } from "@/lib/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assets/$id")({
  component: AssetDetailPage,
});

const STATUS_CLASS: Record<string, string> = {
  available: "status-available",
  allocated: "status-allocated",
  reserved: "status-reserved",
  maintenance: "status-maintenance",
  lost: "status-overdue",
  retired: "status-retired",
};

const LIFECYCLE = ["available", "allocated", "maintenance", "retired"] as const;

function AssetDetailPage() {
  const { id } = useParams({ from: "/_authenticated/assets/$id" });

  const { data: asset, isLoading } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => {
      const [a, cats, depts] = await Promise.all([
        assetsApi.get(id), org.categories(), org.departments(),
      ]);
      const cv = a.custom_values ?? {};
      return {
        ...a,
        status: a.status === "under_maintenance" ? "maintenance" : a.status,
        category: { name: cats.find((c) => c.id === a.category_id)?.name ?? null },
        department: { name: depts.find((d) => d.id === a.owner_department_id)?.name ?? null },
        manufacturer: cv.manufacturer ?? null,
        model: cv.model ?? null,
        purchase_cost: a.acquisition_cost,
        purchase_date: a.acquisition_date ? new Date(a.acquisition_date).toLocaleDateString() : null,
        description: cv.description ?? null,
        warranty_expiry: cv.warranty_expiry ?? null,
      };
    },
  });

  const { data: allocations } = useQuery({
    queryKey: ["asset-allocations", id],
    queryFn: async () => {
      const [{ allocations }, users] = await Promise.all([assetsApi.history(id), userMap()]);
      return allocations.map((r) => ({
        id: r.id,
        allocated_at: r.allocated_at,
        expected_return: r.expected_return_date ? new Date(r.expected_return_date).toLocaleDateString() : null,
        returned_at: r.returned_at,
        status: r.status,
        notes: r.return_notes,
        assignee: users.get(r.holder_id)
          ? { full_name: users.get(r.holder_id)!.name, email: users.get(r.holder_id)!.email }
          : { full_name: `User #${r.holder_id}`, email: "" },
      }));
    },
    enabled: !!asset,
  });

  const { data: maintenance } = useQuery({
    queryKey: ["asset-maintenance", id],
    queryFn: async () => {
      const { maintenance } = await assetsApi.history(id);
      return maintenance.map((m) => ({
        id: m.id, issue: m.issue_description, priority: m.priority,
        status: m.status, created_at: m.created_at, completed_at: null, cost: null,
      }));
    },
    enabled: !!asset,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
        <p className="text-sm text-muted-foreground">Asset not found or you don't have access.</p>
        <Button variant="outline" className="mt-4" asChild><Link to="/assets"><ArrowLeft className="size-4" /> Back to assets</Link></Button>
      </div>
    );
  }

  const currentStage = asset.status === "retired" ? "retired"
    : asset.status === "maintenance" ? "maintenance"
    : asset.status === "allocated" || asset.status === "reserved" ? "allocated"
    : "available";
  const currentIdx = LIFECYCLE.indexOf(currentStage as (typeof LIFECYCLE)[number]);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/assets" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Back to assets
        </Link>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-start gap-4">
          <div className="grid size-14 place-items-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary">
            <Boxes className="size-7" />
          </div>
          <div>
            <p className="font-mono text-xs text-muted-foreground">{asset.asset_tag}</p>
            <h1 className="text-2xl font-bold tracking-tight">{asset.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {asset.category?.name && <span>{asset.category.name}</span>}
              {asset.department?.name && <><span>·</span><span>{asset.department.name}</span></>}
              {asset.manufacturer && <><span>·</span><span>{asset.manufacturer} {asset.model}</span></>}
            </div>
          </div>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide", STATUS_CLASS[asset.status])}>
          {asset.status}
        </span>
      </header>

      {/* Lifecycle stepper */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle</h2>
        <div className="mt-4 flex items-center gap-2">
          {LIFECYCLE.map((stage, i) => (
            <div key={stage} className="flex flex-1 items-center gap-2">
              <div className={cn(
                "grid size-8 place-items-center rounded-full border-2 text-[11px] font-semibold capitalize",
                i <= currentIdx ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary text-muted-foreground"
              )}>{i + 1}</div>
              <span className={cn("text-xs capitalize", i === currentIdx ? "font-semibold text-foreground" : "text-muted-foreground")}>{stage}</span>
              {i < LIFECYCLE.length - 1 && <div className={cn("h-0.5 flex-1", i < currentIdx ? "bg-primary" : "bg-border")} />}
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="allocation">Allocation</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfoCard icon={Hash} label="Serial number" value={asset.serial_number ?? "—"} mono />
            <InfoCard icon={MapPin} label="Location" value={asset.location ?? "—"} />
            <InfoCard icon={Calendar} label="Purchase date" value={asset.purchase_date ?? "—"} />
            <InfoCard icon={DollarSign} label="Purchase cost" value={asset.purchase_cost != null ? `$${Number(asset.purchase_cost).toLocaleString()}` : "—"} />
            <InfoCard icon={Calendar} label="Warranty expiry" value={asset.warranty_expiry ?? "—"} />
            <InfoCard icon={Package} label="Condition" value={asset.condition} />
          </div>
          {asset.description && (
            <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</h3>
              <p className="mt-2 text-sm leading-relaxed">{asset.description}</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="allocation" className="mt-4">
          <ListCard
            empty="No allocation history yet."
            items={(allocations ?? []).map((a) => ({
              key: String(a.id),
              title: a.assignee?.full_name || a.assignee?.email || "Unknown",
              meta: `${new Date(a.allocated_at).toLocaleDateString()}${a.expected_return ? ` → due ${a.expected_return}` : ""}`,
              badge: a.status as string,
              badgeClass: a.status === "active" ? "status-allocated" : "status-available",
            }))}
          />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <ListCard
            empty="No maintenance events logged."
            items={(maintenance ?? []).map((m) => ({
              key: String(m.id),
              title: m.issue,
              meta: `${new Date(m.created_at).toLocaleDateString()} · priority ${m.priority}${m.cost ? ` · $${Number(m.cost).toLocaleString()}` : ""}`,
              badge: m.status,
              badgeClass: m.status === "completed" ? "status-available" : m.status === "in_progress" ? "status-maintenance" : "status-reserved",
            }))}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><FileText className="size-6" /></div>
            <div>
              <p className="text-sm font-medium">No documents attached</p>
              <p className="text-xs text-muted-foreground">Invoices, warranties, and manuals will appear here.</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, mono }: { icon: React.ElementType; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="grid size-9 place-items-center rounded-lg bg-secondary text-muted-foreground"><Icon className="size-4" /></div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={cn("truncate text-sm font-medium capitalize", mono && "font-mono normal-case")}>{value}</p>
      </div>
    </div>
  );
}

function ListCard({ items, empty }: { items: Array<{ key: string; title: string; meta: string; badge: string; badgeClass: string }>; empty: string }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground shadow-card">
        <Wrench className="size-5" />
        <p>{empty}</p>
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {items.map((i) => (
        <div key={i.key} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{i.title}</p>
            <p className="text-xs text-muted-foreground">{i.meta}</p>
          </div>
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", i.badgeClass)}>{i.badge}</span>
        </div>
      ))}
    </div>
  );
}