import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { bookingsApi, assetsApi, org } from "@/lib/api";
import { useSession } from "@/lib/auth/use-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/booking")({
  component: BookingPage,
});

function BookingPage() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Resource Booking</h1>
          <p className="text-sm text-muted-foreground">Reserve rooms, vehicles, and shared equipment without conflicts.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button variant="hero"><Plus className="size-4" /> Book resource</Button></DialogTrigger>
          <BookingDialog onDone={() => setOpen(false)} />
        </Dialog>
      </header>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="mine">My bookings</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-4"><BookingList scope="all" /></TabsContent>
        <TabsContent value="mine" className="mt-4"><BookingList scope="mine" userId={user?.id} /></TabsContent>
        <TabsContent value="resources" className="mt-4"><ResourcesList /></TabsContent>
      </Tabs>
    </div>
  );
}

function BookingList({ scope, userId }: { scope: "all" | "mine"; userId?: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["bookings", scope, userId ?? ""],
    queryFn: async () => {
      const [rows, assets] = await Promise.all([
        bookingsApi.list(scope === "mine" ? { mine: true } : {}),
        assetsApi.list({ bookable: true, limit: 200 }),
      ]);
      const am = new Map(assets.map((a) => [a.id, a]));
      const now = Date.now();
      return rows
        .filter((b) => b.status !== "cancelled" && new Date(b.end_time).getTime() >= now)
        .map((b) => ({
          id: b.id, start_at: b.start_time, end_at: b.end_time, purpose: b.purpose,
          status: b.status === "upcoming" ? "confirmed" : b.status,
          user_id: b.booked_by,
          asset: am.get(b.asset_id) ?? { asset_tag: `#${b.asset_id}`, name: "Resource" },
        }));
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: number) => { await bookingsApi.cancel(id); },
    onSuccess: () => { toast.success("Booking cancelled"); qc.invalidateQueries({ queryKey: ["bookings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (!data?.length) return <Empty title="No upcoming bookings" hint="Reserve a resource to see it here." />;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {data.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0">
          <div className="flex min-w-0 items-center gap-4">
            <span className="font-mono text-xs text-muted-foreground">{b.asset?.asset_tag}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{b.asset?.name}</p>
              {b.purpose && <p className="truncate text-xs text-muted-foreground">{b.purpose}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">{fmtRange(b.start_at, b.end_at)}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              b.status === "confirmed" ? "status-allocated" : b.status === "pending" ? "status-reserved" : "status-available")}>
              {b.status}
            </span>
            {scope === "mine" && (
              <Button size="sm" variant="outline" onClick={() => cancel.mutate(Number(b.id))} disabled={cancel.isPending}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResourcesList() {
  const { data, isLoading } = useQuery({
    queryKey: ["assets", "bookable"],
    queryFn: async () => {
      const [assets, cats] = await Promise.all([assetsApi.list({ bookable: true, limit: 200 }), org.categories()]);
      const cm = new Map(cats.map((c) => [c.id, c.name]));
      return assets.map((a) => ({ ...a, category: { name: cm.get(a.category_id) ?? null } }));
    },
  });
  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data?.length) return <Empty title="No bookable resources" hint="Mark assets as bookable when registering them." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((r) => (
        <div key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="font-mono text-xs text-muted-foreground">{r.asset_tag}</p>
          <p className="mt-1 font-semibold">{r.name}</p>
          <p className="text-xs text-muted-foreground">{r.category?.name ?? "Resource"}{r.location ? ` · ${r.location}` : ""}</p>
        </div>
      ))}
    </div>
  );
}

function BookingDialog({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { user } = useSession();
  const [assetId, setAssetId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [purpose, setPurpose] = useState("");

  const { data: resources } = useQuery({
    queryKey: ["assets", "bookable-select"],
    queryFn: async () => {
      return assetsApi.list({ bookable: true, limit: 200 });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!assetId || !startAt || !endAt) throw new Error("Pick a resource and time range");
      const s = new Date(startAt).toISOString();
      const e = new Date(endAt).toISOString();
      if (new Date(e) <= new Date(s)) throw new Error("End must be after start");
      // Backend rejects overlapping slots (409) — DB exclusion constraint guarantees it.
      await bookingsApi.create(Number(assetId), s, e, purpose || undefined);
    },
    onSuccess: () => { toast.success("Booked"); qc.invalidateQueries({ queryKey: ["bookings"] }); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Book a resource</DialogTitle>
        <DialogDescription>Reserve a shared asset for a specific time window.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Resource</Label>
          <Select value={assetId} onValueChange={setAssetId}>
            <SelectTrigger><SelectValue placeholder="Pick a bookable resource" /></SelectTrigger>
            <SelectContent>{resources?.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.asset_tag} — {r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Start</Label><Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">End</Label><Input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Purpose</Label><Textarea rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Client demo, team offsite…" /></div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={create.isPending}>Cancel</Button>
        <Button variant="hero" onClick={() => create.mutate()} disabled={create.isPending}>{create.isPending ? "Booking…" : "Confirm booking"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function fmtRange(a: string, b: string) {
  const s = new Date(a), e = new Date(b);
  const same = s.toDateString() === e.toDateString();
  const dOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const tOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
  return same
    ? `${s.toLocaleDateString(undefined, dOpts)} · ${s.toLocaleTimeString(undefined, tOpts)} – ${e.toLocaleTimeString(undefined, tOpts)}`
    : `${s.toLocaleDateString(undefined, dOpts)} → ${e.toLocaleDateString(undefined, dOpts)}`;
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><CalendarClock className="size-6" /></div>
      <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{hint}</p></div>
    </div>
  );
}
