import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Building2, Tags, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { org, toBackendRole } from "@/lib/api";
import { useSession, type AppRole } from "@/lib/auth/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/organization")({
  component: OrganizationPage,
});

function OrganizationPage() {
  const { roles } = useSession();
  const isAdmin = roles.includes("admin");

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-card">
        <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Admin access required</p>
        <p className="text-xs text-muted-foreground">Only administrators can manage organization setup.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Organization Setup</h1>
        <p className="text-sm text-muted-foreground">Departments, categories, and the employee directory.</p>
      </header>
      <Tabs defaultValue="departments">
        <TabsList>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
        </TabsList>
        <TabsContent value="departments" className="mt-4"><DepartmentsPane /></TabsContent>
        <TabsContent value="categories" className="mt-4"><CategoriesPane /></TabsContent>
        <TabsContent value="employees" className="mt-4"><EmployeesPane /></TabsContent>
      </Tabs>
    </div>
  );
}

function DepartmentsPane() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const rows = await org.departments();
      return rows.map((d) => ({ id: d.id, name: d.name, is_active: d.status === "active" }));
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      await org.createDepartment(name.trim());
    },
    onSuccess: () => { toast.success("Department added"); qc.invalidateQueries({ queryKey: ["departments-list"] }); qc.invalidateQueries({ queryKey: ["departments"] }); setName(""); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <SetupSection
      title="Departments"
      icon={Building2}
      loading={isLoading}
      items={(data ?? []).map((d) => ({ id: String(d.id), primary: d.name, secondary: d.is_active ? "Active" : "Inactive" }))}
      addLabel="Add department"
      addDialog={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="hero"><Plus className="size-4" /> Add department</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New department</DialogTitle><DialogDescription>Create an organizational unit for scoping assets and audits.</DialogDescription></DialogHeader>
            <div className="space-y-1.5 py-2"><Label className="text-xs text-muted-foreground">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Operations" /></div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="hero" onClick={() => create.mutate()} disabled={create.isPending}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      }
    />
  );
}

function CategoriesPane() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["categories-list"],
    queryFn: async () => {
      const rows = await org.categories();
      return rows.map((c) => ({ id: c.id, name: c.name, is_active: true, description: c.description }));
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name required");
      await org.createCategory(name.trim());
    },
    onSuccess: () => { toast.success("Category added"); qc.invalidateQueries({ queryKey: ["categories-list"] }); qc.invalidateQueries({ queryKey: ["asset-categories"] }); setName(""); setOpen(false); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <SetupSection
      title="Asset categories"
      icon={Tags}
      loading={isLoading}
      items={(data ?? []).map((c) => ({ id: String(c.id), primary: c.name, secondary: c.description ?? (c.is_active ? "Active" : "Inactive") }))}
      addLabel="Add category"
      addDialog={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="hero"><Plus className="size-4" /> Add category</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New category</DialogTitle><DialogDescription>Group similar assets under a shared classification.</DialogDescription></DialogHeader>
            <div className="space-y-1.5 py-2"><Label className="text-xs text-muted-foreground">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Laptops" /></div>
            <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="hero" onClick={() => create.mutate()} disabled={create.isPending}>Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      }
    />
  );
}

function EmployeesPane() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["employees-list"],
    queryFn: async () => {
      const users = await org.employees();
      return users.map((u) => ({
        id: u.id, full_name: u.name, email: u.email, is_active: u.status === "active",
        roles: [u.role === "department_head" ? "dept_head" : u.role] as AppRole[],
      }));
    },
  });

  const setRole = useMutation({
    mutationFn: async (v: { userId: string | number; role: AppRole }) => {
      // The ONLY place roles are assigned (per problem statement).
      await org.setRole(Number(v.userId), toBackendRole(v.role));
    },
    onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: ["employees-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!data?.length) return <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">No employees yet.</div>;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div className="grid grid-cols-[1fr_180px_160px] gap-3 border-b border-border bg-secondary/40 px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Person</span><span>Current role</span><span>Change role</span>
      </div>
      {data.map((p) => (
        <div key={p.id} className="grid grid-cols-[1fr_180px_160px] items-center gap-3 border-b border-border px-5 py-3 text-sm last:border-0">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.full_name || "—"}</p>
            <p className="truncate text-xs text-muted-foreground">{p.email}</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {p.roles.length ? p.roles.map((r) => (
              <span key={r} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">{r.replace("_", " ")}</span>
            )) : <span className="text-xs text-muted-foreground">—</span>}
          </div>
          <Select value={p.roles[0] ?? "employee"} onValueChange={(v) => setRole.mutate({ userId: p.id, role: v as AppRole })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="employee">Employee</SelectItem>
              <SelectItem value="dept_head">Dept head</SelectItem>
              <SelectItem value="asset_manager">Asset manager</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );
}

function SetupSection({
  title, icon: Icon, loading, items, addLabel, addDialog,
}: {
  title: string; icon: React.ElementType; loading: boolean;
  items: Array<{ id: string; primary: string; secondary: string }>;
  addLabel: string; addDialog: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{items.length} {title.toLowerCase()}</p>
        {addDialog}
      </div>
      {loading ? <Skeleton className="h-40 w-full rounded-2xl" /> : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><Icon className="size-6" /></div>
          <p className="text-sm font-medium">No {title.toLowerCase()} yet</p>
          <p className={cn("text-xs text-muted-foreground")}>Use "{addLabel}" above to add the first one.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0">
              <p className="text-sm font-medium">{it.primary}</p>
              <p className="text-xs text-muted-foreground">{it.secondary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// avoid unused-import lint
void Users;
