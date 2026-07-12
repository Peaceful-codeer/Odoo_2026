import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wrench, Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { maintenanceApi, assetsApi } from "@/lib/api";
import { useSession } from "@/lib/auth/use-session";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/maintenance")({
  component: MaintenancePage,
});

type Status = "reported" | "approved" | "in_progress" | "completed" | "rejected";
const COLUMNS: { key: Status; label: string; tone: string }[] = [
  { key: "reported", label: "Reported", tone: "status-reserved" },
  { key: "approved", label: "Approved", tone: "status-allocated" },
  { key: "in_progress", label: "In progress", tone: "status-maintenance" },
  { key: "completed", label: "Completed", tone: "status-available" },
];
const NEXT: Partial<Record<Status, Status>> = { reported: "approved", approved: "in_progress", in_progress: "completed" };

function MaintenancePage() {
  const { roles } = useSession();
  const canManage = roles.includes("admin") || roles.includes("asset_manager");
  const [open, setOpen] = useState(false);

  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance"],
    queryFn: async () => {
      const [rows, assets] = await Promise.all([maintenanceApi.list(), assetsApi.list({ limit: 200 })]);
      const am = new Map(assets.map((a) => [a.id, a]));
      const STATUS_MAP: Record<string, string> = {
        pending: "reported", approved: "approved", technician_assigned: "approved",
        in_progress: "in_progress", resolved: "completed", rejected: "rejected",
      };
      return rows.map((m) => ({
        id: m.id, issue: m.issue_description, priority: m.priority,
        status: STATUS_MAP[m.status] ?? m.status, raw_status: m.status,
        created_at: m.created_at, cost: null,
        asset: am.get(m.asset_id) ?? { asset_tag: `#${m.asset_id}`, name: "Asset" },
      }));
    },
  });

  const advance = useMutation({
    mutationFn: async (v: { id: number; to: Status; raw?: string }) => {
      // Drive the backend approval workflow: Pending -> Approved -> Technician -> InProgress -> Resolved
      if (v.to === "approved") await maintenanceApi.approve(v.id);
      else if (v.to === "in_progress") {
        if (v.raw === "approved") {
          const meId = Number(JSON.parse(atob((localStorage.getItem("af_access") ?? "").split(".")[1] || "e30=")).sub || 0);
          await maintenanceApi.assign(v.id, meId);
        }
        await maintenanceApi.start(v.id);
      } else if (v.to === "completed") await maintenanceApi.resolve(v.id);
    },
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["maintenance"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Maintenance</h1>
          <p className="text-sm text-muted-foreground">Move requests from reported to completed through the approval flow.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="hero"><Plus className="size-4" /> Report issue</Button></DialogTrigger>
          <ReportDialog onDone={() => setOpen(false)} />
        </Dialog>
      </header>

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = (data ?? []).filter((m) => m.status === col.key);
            return (
              <div key={col.key} className="rounded-2xl border border-border bg-card p-3 shadow-card">
                <div className="flex items-center justify-between px-1 pb-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", col.tone)}>{col.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="space-y-2">
                  {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Empty</p>}
                  {items.map((m) => (
                    <div key={m.id} className="rounded-xl border border-border bg-secondary/30 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-[10px] text-muted-foreground">{m.asset?.asset_tag}</p>
                          <p className="mt-0.5 text-sm font-medium">{m.asset?.name}</p>
                        </div>
                        <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase",
                          m.priority === "critical" ? "status-overdue" : m.priority === "high" ? "status-maintenance" : "status-reserved")}>{m.priority}</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{m.issue}</p>
                      {canManage && NEXT[m.status as Status] && (
                        <Button size="sm" variant="outline" className="mt-3 w-full"
                          onClick={() => advance.mutate({ id: Number(m.id), to: NEXT[m.status as Status]!, raw: (m as any).raw_status })}
                          disabled={advance.isPending}>
                          Move to {NEXT[m.status as Status]!.replace("_", " ")} <ArrowRight className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReportDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [assetId, setAssetId] = useState("");
  const [issue, setIssue] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");

  const { data: assets } = useQuery({
    queryKey: ["assets", "for-maintenance"],
    queryFn: async () => {
      return assetsApi.list({ limit: 200 });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!assetId || !issue.trim()) throw new Error("Pick an asset and describe the issue");
      await maintenanceApi.raise(Number(assetId), issue.trim(), priority);
    },
    onSuccess: () => { toast.success("Issue reported"); qc.invalidateQueries({ queryKey: ["maintenance"] }); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Report a maintenance issue</DialogTitle>
        <DialogDescription>Raise a ticket so an asset manager can approve and assign the fix.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Asset</Label>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger><SelectValue placeholder="Pick an asset" /></SelectTrigger>
            <SelectContent>{assets?.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.asset_tag} — {a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Priority</Label>
          <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Issue</Label>
          <Textarea rows={4} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Describe the problem…" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={create.isPending}>Cancel</Button>
        <Button variant="hero" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Reporting…" : "Report"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
