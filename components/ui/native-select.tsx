import * as React from "react";
import { cn } from "@/lib/utils";

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-[14px] border border-input bg-white/90 px-3.5 text-sm text-slate-900 outline-none transition focus:border-ring/70 focus:ring-4 focus:ring-ring/10",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
