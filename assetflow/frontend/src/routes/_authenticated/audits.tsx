import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Plus, Play, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { auditsApi, assetsApi, org } from "@/lib/api";
import { useSession } from "@/lib/auth/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/audits")({
  component: AuditsPage,
});

type ItemResult = "pending" | "verified" | "missing" | "damaged" | "misplaced";

function AuditsPage() {
  const { roles } = useSession();
  const canManage = roles.includes("admin") || roles.includes("asset_manager");
  const [openId, setOpenId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-cycles"],
    queryFn: async () => {
      const [cycles, depts] = await Promise.all([auditsApi.cycles(), org.departments()]);
      const dm = new Map(depts.map((d) => [d.id, d.name]));
      return cycles.map((c) => ({
        id: String(c.id), name: c.name,
        status: c.status === "closed" ? "completed" : "in_progress",
        scope_department: { name: c.scope_department_id != null ? dm.get(c.scope_department_id) ?? null : null },
        scope_category: { name: c.scope_location ?? null },
      }));
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Audit Cycles</h1>
          <p className="text-sm text-muted-foreground">Verify physical inventory against the registry with scoped checklists.</p>
        </div>
        {canManage && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild><Button variant="hero"><Plus className="size-4" /> New cycle</Button></DialogTrigger>
            <NewCycleDialog onDone={() => setCreateOpen(false)} />
          </Dialog>
        )}
      </header>

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : !data?.length ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
          <div className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><ClipboardCheck className="size-6" /></div>
          <div><p className="text-sm font-medium">No audit cycles yet</p><p className="text-xs text-muted-foreground">Create one to verify inventory scope.</p></div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          {data.map((c) => (
            <button key={c.id} onClick={() => setOpenId(String(c.id))} className="flex w-full items-center justify-between gap-3 border-b border-border px-5 py-3 text-left hover:bg-secondary/40 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.scope_department?.name ?? "All departments"} · {c.scope_category?.name ?? "All categories"}
                </p>
              </div>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                c.status === "completed" ? "status-available" : c.status === "in_progress" ? "status-maintenance" : c.status === "cancelled" ? "status-overdue" : "status-reserved")}>
                {c.status.replace("_", " ")}
              </span>
            </button>
          ))}
        </div>
      )}

      {openId && <CycleDialog cycleId={openId} onClose={() => setOpenId(null)} canManage={canManage} />}
    </div>
  );
}

function NewCycleDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [name, setName] = useState("");
  const [deptId, setDeptId] = useState<string>("all");
  const [catId, setCatId] = useState<string>("all");

  const { data: depts } = useQuery({ queryKey: ["departments"], queryFn: async () => {
    return org.departments();
  }});
  const { data: cats } = useQuery({ queryKey: ["asset-categories"], queryFn: async () => {
    return org.categories();
  }});

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Give the cycle a name");
      // Backend snapshots in-scope assets into audit items automatically (Admin only).
      await auditsApi.create({
        name: name.trim(),
        scope_department_id: deptId === "all" ? null : Number(deptId),
        start_date: new Date().toISOString(),
        end_date: new Date(Date.now() + 7 * 864e5).toISOString(),
        auditor_ids: user ? [Number(user.id)] : [],
      });
    },
    onSuccess: () => { toast.success("Cycle created"); qc.invalidateQueries({ queryKey: ["audit-cycles"] }); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New audit cycle</DialogTitle><DialogDescription>Scope by department and category — a checklist is generated automatically.</DialogDescription></DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 Warehouse Audit" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Department</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All departments</SelectItem>{depts?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={catId} onValueChange={setCatId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">All categories</SelectItem>{cats?.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <DialogFooter><Button variant="outline" onClick={onDone}>Cancel</Button><Button variant="hero" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Creating…" : "Create"}</Button></DialogFooter>
    </DialogContent>
  );
}

function CycleDialog({ cycleId, onClose, canManage }: { cycleId: string; onClose: () => void; canManage: boolean }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const { data: cycle } = useQuery({
    queryKey: ["audit-cycle", cycleId],
    queryFn: async () => {
      const cycles = await auditsApi.cycles();
      const c = cycles.find((x) => String(x.id) === String(cycleId));
      return c ? { ...c, status: c.status === "closed" ? "completed" : "in_progress" } : null;
    },
  });
  const { data: items } = useQuery({
    queryKey: ["audit-items", cycleId],
    queryFn: async () => {
      const [items, assets] = await Promise.all([auditsApi.items(cycleId), assetsApi.list({ limit: 200 })]);
      const am = new Map(assets.map((a) => [a.id, a]));
      return items.map((it) => ({
        id: String(it.id), result: it.status as ItemResult, notes: it.notes,
        asset: am.get(it.asset_id) ?? { asset_tag: `#${it.asset_id}`, name: "Asset" },
      }));
    },
  });

  const setResult = useMutation({
    mutationFn: async (v: { id: number; result: ItemResult }) => {
      if (v.result === "pending" || v.result === "misplaced") throw new Error("Mark as verified, missing, or damaged");
      await auditsApi.mark(v.id, v.result as "verified" | "missing" | "damaged");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit-items", cycleId] }),
  });

  const start = useMutation({
    mutationFn: async () => { /* cycles are active from creation in the backend */ },
    onSuccess: () => { toast.success("Cycle started"); qc.invalidateQueries({ queryKey: ["audit-cycles"] }); qc.invalidateQueries({ queryKey: ["audit-cycle", cycleId] }); },
  });

  const complete = useMutation({
    mutationFn: async () => {
      // Close = lock cycle; backend flips confirmed-missing assets to Lost.
      await auditsApi.close(cycleId);
    },
    onSuccess: () => { toast.success("Cycle closed"); qc.invalidateQueries({ queryKey: ["audit-cycles"] }); onClose(); },
  });

  const stats = (items ?? []).reduce((acc, it) => { acc[it.result] = (acc[it.result] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cycle?.name ?? "Audit cycle"}</DialogTitle>
          <DialogDescription>
            {(items?.length ?? 0)} items · {stats.verified ?? 0} verified · {stats.pending ?? 0} pending · {(stats.missing ?? 0) + (stats.damaged ?? 0) + (stats.misplaced ?? 0)} discrepancies
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2">
          {(items ?? []).map((it) => (
            <div key={it.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="font-mono text-[11px] text-muted-foreground">{it.asset?.asset_tag}</p>
                <p className="truncate text-sm">{it.asset?.name}</p>
              </div>
              {canManage ? (
                <Select value={it.result} onValueChange={(v) => setResult.mutate({ id: Number(it.id), result: v as ItemResult })}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="missing">Missing</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    </SelectContent>
                </Select>
              ) : (
                <span className="text-xs capitalize text-muted-foreground">{it.result}</span>
              )}
            </div>
          ))}
          {!items?.length && <p className="py-6 text-center text-xs text-muted-foreground">No items in this cycle.</p>}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          {canManage && cycle?.status === "draft" && (
            <Button variant="hero" onClick={() => start.mutate()} disabled={start.isPending}><Play className="size-4" /> Start cycle</Button>
          )}
          {canManage && cycle?.status === "in_progress" && (
            <AlertDialog>
              <AlertDialogTrigger asChild><Button variant="hero"><CheckCircle2 className="size-4" /> Close cycle</Button></AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close this audit cycle?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Any remaining pending items will stay unverified in the discrepancy report. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => complete.mutate()}>Close cycle</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
