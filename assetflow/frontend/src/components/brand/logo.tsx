import { cn } from "@/lib/utils";

export function AssetFlowLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        aria-hidden
        className="grid size-8 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 1.5 14.5 5v6L8 14.5 1.5 11V5L8 1.5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M1.5 5 8 8.5 14.5 5M8 8.5V14.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
      <span className="text-lg font-bold tracking-tight text-foreground">
        Asset<span className="text-primary">Flow</span>
      </span>
    </div>
  );
}
