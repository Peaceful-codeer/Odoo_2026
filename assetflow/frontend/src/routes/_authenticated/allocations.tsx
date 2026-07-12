import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowRightLeft, Check, X, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { allocationsApi, transfersApi, assetsApi, userMap } from "@/lib/api";
import { useSession } from "@/lib/auth/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/allocations")({
  component: AllocationsPage,
});

function AllocationsPage() {
  const { roles, user } = useSession();
  const canManage = roles.includes("admin") || roles.includes("asset_manager");
  const canDecide = canManage || roles.includes("dept_head");
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Allocations & Transfers</h1>
          <p className="text-sm text-muted-foreground">Track who holds what and route transfer requests through approval.</p>
        </div>
        {canManage && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button variant="hero"><Plus className="size-4" /> New allocation</Button></DialogTrigger>
            <NewAllocationDialog onDone={() => setOpen(false)} />
          </Dialog>
        )}
      </header>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="transfers">Transfer requests</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-4"><ActiveAllocationsList canManage={canManage} /></TabsContent>
        <TabsContent value="transfers" className="mt-4"><TransferRequestsList canDecide={canDecide} currentUserId={user?.id} /></TabsContent>
        <TabsContent value="history" className="mt-4"><HistoryList /></TabsContent>
      </Tabs>
    </div>
  );
}

function ActiveAllocationsList({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["allocations", "active"],
    queryFn: async () => {
      const [rows, assets, users] = await Promise.all([
        allocationsApi.list({ active_only: true }), assetsApi.list({ limit: 200 }), userMap(),
      ]);
      const am = new Map(assets.map((a) => [a.id, a]));
      return rows.map((r) => ({
        id: r.id,
        allocated_at: r.allocated_at,
        expected_return: r.expected_return_date,
        status: r.status,
        asset: am.get(r.asset_id) ?? { id: r.asset_id, asset_tag: `#${r.asset_id}`, name: "Asset" },
        assignee_name: users.get(r.holder_id)?.name ?? `User #${r.holder_id}`,
      }));
    },
  });

  const returnMut = useMutation({
    mutationFn: async (a: { id: number; assetId: number }) => {
      await allocationsApi.return(a.id);   // backend flips asset to Available + records check-in
    },
    onSuccess: () => {
      toast.success("Marked as returned");
      qc.invalidateQueries({ queryKey: ["allocations"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!data?.length) return <EmptyBox icon={ArrowRightLeft} title="No active allocations" hint="Assign an asset to get started." />;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {data.map((a) => {
        const overdue = a.expected_return && new Date(a.expected_return) < new Date() && a.status !== "returned";
        return (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0">
            <div className="flex min-w-0 items-center gap-4">
              <span className="font-mono text-xs text-muted-foreground">{a.asset?.asset_tag}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{a.asset?.name}</p>
                <p className="text-xs text-muted-foreground">Held by {a.assignee_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {a.expected_return && (
                <span className={cn("text-xs", overdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
                  Due {new Date(a.expected_return).toLocaleDateString()}
                </span>
              )}
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", overdue ? "status-overdue" : "status-allocated")}>
                {overdue ? "Overdue" : "Active"}
              </span>
              {canManage && a.asset && (
                <Button size="sm" variant="outline" onClick={() => returnMut.mutate({ id: Number(a.id), assetId: Number(a.asset!.id) })} disabled={returnMut.isPending}>
                  <RotateCcw className="size-3.5" /> Return
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TransferRequestsList({ canDecide, currentUserId }: { canDecide: boolean; currentUserId?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const [rows, assets, users] = await Promise.all([
        transfersApi.list(), assetsApi.list({ limit: 200 }), userMap(),
      ]);
      const am = new Map(assets.map((a) => [a.id, a]));
      return rows.map((r) => ({
        id: r.id,
        status: r.status === "requested" ? "pending" : r.status,   // UI uses "pending"
        reason: r.reason,
        created_at: r.created_at,
        asset: am.get(r.asset_id) ?? { id: r.asset_id, asset_tag: `#${r.asset_id}`, name: "Asset" },
        from_name: r.from_user_id ? users.get(r.from_user_id)?.name ?? null : null,
        to_name: users.get(r.to_user_id)?.name ?? `User #${r.to_user_id}`,
      }));
    },
  });

  const decide = useMutation({
    mutationFn: async (v: { id: number; status: "approved" | "rejected" }) => {
      if (v.status === "approved") await transfersApi.approve(v.id);
      else await transfersApi.reject(v.id);
    },
    onSuccess: () => { toast.success("Request updated"); qc.invalidateQueries({ queryKey: ["transfers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!data?.length) return <EmptyBox icon={ArrowRightLeft} title="No transfer requests" hint="Requests will appear here when raised." />;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {data.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-muted-foreground">{t.asset?.asset_tag}</span>
              <p className="truncate text-sm font-medium">{t.asset?.name}</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.from_name ? `${t.from_name} → ` : ""}{t.to_name}{t.reason ? ` · ${t.reason}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              t.status === "pending" ? "status-reserved" : t.status === "approved" ? "status-available" : t.status === "rejected" ? "status-overdue" : "status-allocated")}>
              {t.status}
            </span>
            {canDecide && t.status === "pending" && (
              <>
                <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: Number(t.id), status: "rejected" })}><X className="size-3.5" /></Button>
                <Button size="sm" variant="hero" onClick={() => decide.mutate({ id: Number(t.id), status: "approved" })}><Check className="size-3.5" /></Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryList() {
  const { data, isLoading } = useQuery({
    queryKey: ["allocations", "history"],
    queryFn: async () => {
      const [rows, assets, users] = await Promise.all([
        allocationsApi.list(), assetsApi.list({ limit: 200 }), userMap(),
      ]);
      const am = new Map(assets.map((a) => [a.id, a]));
      return rows.filter((r) => r.status === "returned").slice(0, 50).map((r) => ({
        id: r.id, allocated_at: r.allocated_at, returned_at: r.returned_at,
        asset: am.get(r.asset_id) ?? { asset_tag: `#${r.asset_id}`, name: "Asset" },
        name: users.get(r.holder_id)?.name ?? `User #${r.holder_id}`,
      }));
    },
  });
  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data?.length) return <EmptyBox icon={ArrowRightLeft} title="No history yet" hint="Returned allocations will show here." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {data.map((h) => (
        <div key={h.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0">
          <div className="flex items-center gap-4">
            <span className="font-mono text-xs text-muted-foreground">{h.asset?.asset_tag}</span>
            <p className="text-sm">{h.asset?.name} <span className="text-muted-foreground">· {h.name}</span></p>
          </div>
          <span className="text-xs text-muted-foreground">{h.returned_at ? new Date(h.returned_at).toLocaleDateString() : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function NewAllocationDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [assetId, setAssetId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notes, setNotes] = useState("");

  const { data: assets } = useQuery({
    queryKey: ["assets", "available"],
    queryFn: async () => {
      return assetsApi.list({ status: "available", limit: 200 });
    },
  });
  const { data: people } = useQuery({
    queryKey: ["people"],
    queryFn: async () => {
      const users = await userMap();
      return [...users.values()].map((u) => ({ id: u.id, full_name: u.name, email: u.email }));
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!assetId || !assigneeId) throw new Error("Pick an asset and an assignee");
      // Backend enforces the double-allocation rule and flips asset status atomically.
      await allocationsApi.allocate(
        Number(assetId), Number(assigneeId),
        expectedReturn ? new Date(expectedReturn).toISOString() : null,
      );
    },
    onSuccess: () => {
      toast.success("Asset allocated");
      qc.invalidateQueries({ queryKey: ["allocations"] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>New allocation</DialogTitle>
        <DialogDescription>Assign an available asset to a team member.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Asset</Label>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger><SelectValue placeholder="Pick an available asset" /></SelectTrigger>
            <SelectContent>{assets?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.asset_tag} — {a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Assign to</Label>
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger><SelectValue placeholder="Pick a team member" /></SelectTrigger>
            <SelectContent>{people?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.full_name || p.email}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Expected return</Label>
          <Input type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={create.isPending}>Cancel</Button>
        <Button variant="hero" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Allocating…" : "Allocate"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function EmptyBox({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><Icon className="size-6" /></div>
      <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{hint}</p></div>
    </div>
  );
}
