import * as React from "react";
import { cn } from "@/lib/utils";

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-2xl border border-slate-200/80 bg-white/90 px-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500/50 focus:ring-4 focus:ring-cyan-500/10",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
