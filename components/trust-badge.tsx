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
      badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
      dot: "bg-emerald-600 text-white",
    };
  }

  if (normalized === "unverified" || normalized === "proposed" || normalized === "approved_copy") {
    return {
      badge: "border-[#cfd9ee] bg-[#f3f6ff] text-[#3557ff]",
      dot: "bg-[#3557ff] text-white",
    };
  }

  if (normalized === "disputed" || normalized === "rejected" || normalized === "restricted") {
    return {
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      dot: "bg-rose-600 text-white",
    };
  }

  return {
    badge: "border-[#dce3ed] bg-[#f6f8fb] text-slate-700",
    dot: "bg-slate-500 text-white",
  };
}

export function TrustBadge({ kind, value }: { kind: Kind; value: string }) {
  const tone = toneFor(value);

  return (
    <Badge
      className={cn(
        "h-7 border px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
        tone.badge,
      )}
      variant="outline"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-4 items-center justify-center text-[8px] font-bold tracking-normal",
          tone.dot,
        )}
      >
        {symbols[kind]}
      </span>
      <span>{value.replaceAll("_", " ")}</span>
    </Badge>
  );
}
