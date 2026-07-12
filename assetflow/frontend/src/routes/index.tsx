import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BoxesIcon, CalendarClock, ShieldCheck, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssetFlowLogo } from "@/components/brand/logo";

export const Route = createFileRoute("/")({
  component: Landing,
});

const features = [
  {
    icon: BoxesIcon,
    title: "Asset lifecycle tracking",
    body: "Register every asset with photos, warranty docs, and QR-ready tags. Follow it from Available to Retired with full history.",
  },
  {
    icon: CalendarClock,
    title: "Conflict-free booking",
    body: "Rooms, vehicles, and shared equipment on a timeline that refuses double-bookings before they happen.",
  },
  {
    icon: Wrench,
    title: "Maintenance workflow",
    body: "Kanban approval flow — request, approve, assign, resolve. Asset status updates itself.",
  },
  {
    icon: ShieldCheck,
    title: "Audit cycles",
    body: "Scoped audit runs with Verified / Missing / Damaged checks and auto-generated discrepancy reports.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-gradient-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <AssetFlowLogo />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link to="/auth">Log in</Link>
          </Button>
          <Button variant="hero" asChild>
            <Link to="/auth" search={{ mode: "signup" }}>
              Get started <ArrowRight className="size-4" />
            </Link>
          </Button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <section className="grid gap-12 md:grid-cols-2 md:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground shadow-card">
              <span className="size-1.5 rounded-full bg-success" /> Operational since 2026
            </div>
            <h1 className="text-4xl font-bold leading-[1.05] tracking-tight text-foreground md:text-6xl">
              Track every asset.
              <br />
              Book every resource.
              <span className="block bg-gradient-primary bg-clip-text text-transparent">
                One platform.
              </span>
            </h1>
            <p className="max-w-lg text-lg text-muted-foreground">
              AssetFlow gives operations teams a calm, precise system of record — from registration to retirement, from booking to audit.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="hero" size="lg" asChild>
                <Link to="/auth" search={{ mode: "signup" }}>
                  Get started free <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link to="/auth">Log in</Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-primary opacity-20 blur-2xl" aria-hidden />
            <div className="relative rounded-3xl border border-border bg-card p-6 shadow-elevated">
              <div className="mb-4 flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-destructive/70" />
                <span className="size-2.5 rounded-full bg-warning/70" />
                <span className="size-2.5 rounded-full bg-success/70" />
                <span className="ml-3 text-xs text-muted-foreground">assetflow.app/dashboard</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Available", value: "1,248", tone: "text-success" },
                  { label: "Allocated", value: "856", tone: "text-info" },
                  { label: "Overdue", value: "12", tone: "text-destructive" },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl bg-secondary/60 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k.label}</p>
                    <p className={`mt-1 text-2xl font-semibold ${k.tone}`}>{k.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {[
                  { tag: "AF-0114", name: "MacBook Pro 16\"", status: "Overdue", cls: "status-overdue" },
                  { tag: "AF-0922", name: "Room B2", status: "Reserved", cls: "status-reserved" },
                  { tag: "AF-2101", name: "Projector V7", status: "Maintenance", cls: "status-maintenance" },
                ].map((row) => (
                  <div key={row.tag} className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground">{row.tag}</span>
                      <span className="text-sm font-medium">{row.name}</span>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${row.cls}`}>
                      {row.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-24 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-elevated">
              <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border bg-card/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-sm text-muted-foreground">
          <AssetFlowLogo />
          <span>© 2026 AssetFlow</span>
        </div>
      </footer>
    </div>
  );
}
