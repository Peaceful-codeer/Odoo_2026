import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Package, Filter } from "lucide-react";
import { toast } from "sonner";
import { assetsApi, org } from "@/lib/api";
import { useSession } from "@/lib/auth/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/assets")({
  component: AssetsLayout,
});

function AssetsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((m) => m.routeId === "/_authenticated/assets/$id");
  if (isDetail) return <Outlet />;
  return <AssetsIndex />;
}

type StatusFilter = "all" | "available" | "allocated" | "reserved" | "maintenance" | "lost" | "retired";

const STATUS_CLASS: Record<string, string> = {
  available: "status-available",
  allocated: "status-allocated",
  reserved: "status-reserved",
  maintenance: "status-maintenance",
  lost: "status-overdue",
  retired: "status-retired",
};

function AssetsIndex() {
  const { roles } = useSession();
  const canManage = roles.includes("admin") || roles.includes("asset_manager");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [open, setOpen] = useState(false);

  const { data: assets, isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: async () => {
      const [assets, cats, depts] = await Promise.all([
        assetsApi.list({ limit: 200 }), org.categories(), org.departments(),
      ]);
      const catMap = new Map(cats.map((c) => [c.id, c.name]));
      const deptMap = new Map(depts.map((d) => [d.id, d.name]));
      return assets.map((a) => ({
        ...a,
        status: a.status === "under_maintenance" ? "maintenance" : a.status,
        category: { name: catMap.get(a.category_id) ?? null },
        department: { name: a.owner_department_id != null ? deptMap.get(a.owner_department_id) ?? null : null },
      }));
    },
  });

  const filtered = useMemo(() => {
    return (assets ?? []).filter((a) => {
      if (status !== "all" && a.status !== status) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        a.asset_tag.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.location ?? "").toLowerCase().includes(q)
      );
    });
  }, [assets, search, status]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Assets</h1>
          <p className="text-sm text-muted-foreground">Registry of every tracked item across the organization.</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="hero"><Plus className="size-4" /> Register asset</Button>
            </DialogTrigger>
            <RegisterAssetDialog onDone={() => setOpen(false)} />
          </Dialog>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-card">
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by tag, name, location…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="allocated">Allocated</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="lost">Lost</SelectItem>
              <SelectItem value="retired">Retired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        <div className="grid grid-cols-[110px_1fr_140px_120px_140px_100px] gap-3 border-b border-border bg-secondary/40 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Tag</span><span>Name</span><span>Category</span><span>Department</span><span>Location</span><span>Status</span>
        </div>
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="grid grid-cols-[110px_1fr_140px_120px_140px_100px] gap-3 border-b border-border px-5 py-3">
              {Array.from({ length: 6 }).map((__, j) => <Skeleton key={j} className="h-4" />)}
            </div>
          ))
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><Package className="size-6" /></div>
            <div>
              <p className="text-sm font-medium">{assets?.length ? "No assets match your filters" : "No assets registered yet"}</p>
              <p className="text-xs text-muted-foreground">{canManage ? "Register your first asset to get started." : "Ask an asset manager to register items."}</p>
            </div>
          </div>
        ) : (
          filtered.map((a) => (
            <Link
              key={a.id}
              to="/assets/$id"
              params={{ id: String(a.id) }}
              className="grid grid-cols-[110px_1fr_140px_120px_140px_100px] items-center gap-3 border-b border-border px-5 py-3 text-sm transition-colors hover:bg-secondary/40 last:border-0"
            >
              <span className="font-mono text-xs text-muted-foreground">{a.asset_tag}</span>
              <span className="truncate font-medium">{a.name}</span>
              <span className="truncate text-muted-foreground">{a.category?.name ?? "—"}</span>
              <span className="truncate text-muted-foreground">{a.department?.name ?? "—"}</span>
              <span className="truncate text-muted-foreground">{a.location ?? "—"}</span>
              <span className={cn("w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", STATUS_CLASS[a.status])}>
                {a.status}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

function RegisterAssetDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: cats } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: async () => {
      return org.categories();
    },
  });
  const { data: depts } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      return org.departments();
    },
  });

  const [form, setForm] = useState({
    asset_tag: "",
    name: "",
    category_id: "",
    department_id: "",
    condition: "good" as "new" | "good" | "fair" | "poor",
    serial_number: "",
    manufacturer: "",
    model: "",
    purchase_date: "",
    purchase_cost: "",
    warranty_expiry: "",
    location: "",
    description: "",
    is_bookable: false,
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const mut = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      if (!form.category_id) throw new Error("Category is required");
      await assetsApi.create({
        name: form.name.trim(),
        category_id: Number(form.category_id),
        owner_department_id: form.department_id ? Number(form.department_id) : null,
        condition: form.condition,
        serial_number: form.serial_number.trim() || null,
        acquisition_date: form.purchase_date ? new Date(form.purchase_date).toISOString() : null,
        acquisition_cost: form.purchase_cost ? Number(form.purchase_cost) : null,
        location: form.location.trim() || null,
        is_bookable: form.is_bookable,
        custom_values: {
          manufacturer: form.manufacturer.trim() || undefined,
          model: form.model.trim() || undefined,
          warranty_expiry: form.warranty_expiry || undefined,
          description: form.description.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Asset registered");
      qc.invalidateQueries({ queryKey: ["assets"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Register a new asset</DialogTitle>
        <DialogDescription>Add an item to the organizational registry with its identity and lifecycle details.</DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-2">
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Identity</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Asset tag"><Input value="Auto-generated (AF-XXXX)" disabled className="font-mono" /></Field>
            <Field label="Name *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="MacBook Pro 14" /></Field>
            <Field label="Category">
              <Select value={form.category_id} onValueChange={(v) => set("category_id", v)}>
                <SelectTrigger><SelectValue placeholder="Uncategorized" /></SelectTrigger>
                <SelectContent>{cats?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Department">
              <Select value={form.department_id} onValueChange={(v) => set("department_id", v)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>{depts?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Specs</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Manufacturer"><Input value={form.manufacturer} onChange={(e) => set("manufacturer", e.target.value)} /></Field>
            <Field label="Model"><Input value={form.model} onChange={(e) => set("model", e.target.value)} /></Field>
            <Field label="Serial number"><Input value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} className="font-mono" /></Field>
            <Field label="Condition">
              <Select value={form.condition} onValueChange={(v) => set("condition", v as typeof form.condition)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lifecycle & location</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Purchase date"><Input type="date" value={form.purchase_date} onChange={(e) => set("purchase_date", e.target.value)} /></Field>
            <Field label="Purchase cost"><Input type="number" inputMode="decimal" value={form.purchase_cost} onChange={(e) => set("purchase_cost", e.target.value)} placeholder="0.00" /></Field>
            <Field label="Warranty expiry"><Input type="date" value={form.warranty_expiry} onChange={(e) => set("warranty_expiry", e.target.value)} /></Field>
            <div className="sm:col-span-3">
              <Field label="Location"><Input value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="Building A · Floor 3 · Locker 12" /></Field>
            </div>
            <div className="sm:col-span-3">
              <Field label="Description"><Textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} /></Field>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/30 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Bookable resource</p>
              <p className="text-xs text-muted-foreground">Allow employees to reserve time slots for this asset.</p>
            </div>
            <Switch checked={form.is_bookable} onCheckedChange={(v) => set("is_bookable", v)} />
          </div>
        </section>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={mut.isPending}>Cancel</Button>
        <Button variant="hero" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Registering…" : "Register asset"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
