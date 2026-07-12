import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, ScrollText, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { notificationsApi, logsApi } from "@/lib/api";
import { useSession } from "@/lib/auth/use-session";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Activity & Notifications</h1>
        <p className="text-sm text-muted-foreground">Your alerts and the organizational audit trail.</p>
      </header>
      <Tabs defaultValue="notifications">
        <TabsList>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="activity">Activity log</TabsTrigger>
        </TabsList>
        <TabsContent value="notifications" className="mt-4"><NotificationsList /></TabsContent>
        <TabsContent value="activity" className="mt-4"><ActivityList /></TabsContent>
      </Tabs>
    </div>
  );
}

function NotificationsList() {
  const { user } = useSession();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["notifications", user?.id ?? ""],
    queryFn: async () => {
      const rows = await notificationsApi.list();
      return rows.map((n) => ({
        id: n.id, title: n.title, body: n.message, category: n.type.replace(/_/g, " "),
        read_at: n.is_read ? n.created_at : null, created_at: n.created_at, link: null,
      }));
    },
    enabled: !!user,
  });

  const markAll = useMutation({
    mutationFn: async () => {
      await notificationsApi.markAllRead();
    },
    onSuccess: () => { toast.success("All caught up"); qc.invalidateQueries({ queryKey: ["notifications"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data?.length) return <Empty icon={Bell} title="No notifications" hint="You're all caught up." />;

  const unread = data.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{unread} unread of {data.length}</p>
        {unread > 0 && <Button size="sm" variant="outline" onClick={() => markAll.mutate()}><CheckCheck className="size-3.5" /> Mark all read</Button>}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
        {data.map((n) => (
          <div key={n.id} className={cn("flex items-start gap-3 border-b border-border px-5 py-3 last:border-0", !n.read_at && "bg-primary/5")}>
            <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.read_at ? "bg-muted-foreground/30" : "bg-primary")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{n.title}</p>
              {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">{n.category} · {new Date(n.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActivityList() {
  const { data, isLoading } = useQuery({
    queryKey: ["activity"],
    queryFn: async () => {
      return logsApi.list(100);   // managerial roles only; employees get 403 -> empty

    },
  });
  if (isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;
  if (!data?.length) return <Empty icon={ScrollText} title="No activity yet" hint="Events will show here as work happens." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      {data.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 last:border-0">
          <div className="min-w-0">
            <p className="text-sm"><span className="font-medium">{a.action}</span> <span className="text-muted-foreground">on {a.entity_type}</span></p>
          </div>
          <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

function Empty({ icon: Icon, title, hint }: { icon: React.ElementType; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-secondary text-muted-foreground"><Icon className="size-6" /></div>
      <div><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{hint}</p></div>
    </div>
  );
}
