import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SummaryRow {
  label: ReactNode;
  value: ReactNode;
  accent?: boolean;
}

export function SummaryRows({
  rows,
  className,
}: {
  rows: SummaryRow[];
  className?: string;
}) {
  return (
    <div className={cn("space-y-1 rounded-lg bg-muted/50 p-3 text-sm", className)}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-baseline justify-between gap-3">
          <span className="text-muted-foreground">{row.label}</span>
          <span
            className={cn(
              "text-right font-medium",
              row.accent && "font-bold text-emerald-600"
            )}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}