type Kind = "verification" | "origin" | "lifecycle" | "sensitivity";

const symbols: Record<Kind, string> = {
  verification: "V",
  origin: "O",
  lifecycle: "L",
  sensitivity: "S",
};

export function TrustBadge({ kind, value }: { kind: Kind; value: string }) {
  return (
    <span className={`trust-badge trust-${value.toLowerCase().replaceAll("_", "-")}`}>
      <span aria-hidden="true" className="trust-symbol">
        {symbols[kind]}
      </span>
      <span>{value.replaceAll("_", " ")}</span>
    </span>
  );
}
