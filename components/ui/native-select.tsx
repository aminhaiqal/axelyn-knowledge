import * as React from "react";
import { cn } from "@/lib/utils";

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full border border-input bg-white px-3.5 text-sm text-slate-900 outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/10",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
