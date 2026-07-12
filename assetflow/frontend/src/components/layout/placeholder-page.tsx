import { Construction } from "lucide-react";

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      <div className="grid place-items-center rounded-3xl border border-dashed border-border bg-card/60 p-16 text-center shadow-card">
        <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Construction className="size-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Coming next</h2>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          This module is queued in the AssetFlow build plan. The design system and shell are ready — data,
          workflows, and rich interactions land in the next phase.
        </p>
      </div>
    </div>
  );
}
