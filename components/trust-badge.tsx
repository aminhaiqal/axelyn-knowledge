import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Kind = "verification" | "origin" | "lifecycle" | "sensitivity";

const symbols: Record<Kind, string> = {
  verification: "V",
  origin: "O",
  lifecycle: "L",
  sensitivity: "S",
};

function toneFor(value: string) {
  const normalized = value.toLowerCase();

  if (
    normalized === "source_supported" ||
    normalized === "human_confirmed" ||
    normalized === "active"
  ) {
    return {
      badge: "border-emerald-300/70 bg-emerald-50 text-emerald-700",
      dot: "bg-emerald-600 text-emerald-50",
    };
  }

  if (normalized === "unverified" || normalized === "proposed" || normalized === "approved_copy") {
    return {
      badge: "border-amber-300/70 bg-amber-50 text-amber-700",
      dot: "bg-amber-600 text-amber-50",
    };
  }

  if (normalized === "disputed" || normalized === "rejected" || normalized === "restricted") {
    return {
      badge: "border-rose-300/70 bg-rose-50 text-rose-700",
      dot: "bg-rose-600 text-rose-50",
    };
  }

  return {
    badge: "border-slate-300/80 bg-slate-100 text-slate-700",
    dot: "bg-slate-600 text-slate-50",
  };
}

export function TrustBadge({ kind, value }: { kind: Kind; value: string }) {
  const tone = toneFor(value);

  return (
    <Badge
      className={cn(
        "h-7 rounded-full border px-2.5 text-[10px] font-semibold uppercase tracking-[0.18em]",
        tone.badge,
      )}
      variant="outline"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 items-center justify-center rounded-full text-[8px] font-bold tracking-normal",
          tone.dot,
        )}
      >
        {symbols[kind]}
      </span>
      <span>{value.replaceAll("_", " ")}</span>
    </Badge>
  );
}
