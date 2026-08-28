import type { KnowledgeSource } from "@/src/domain/models";
import type { ExtractionOutput } from "@/src/domain/schemas";

export function validateGroundedExtraction(
  source: KnowledgeSource,
  output: ExtractionOutput,
  options: { requireProposal?: boolean } = {},
): void {
  if (options.requireProposal && output.nodes.length === 0) {
    throw new Error("Extraction returned no reusable knowledge proposals.");
  }

  for (const proposal of [...output.nodes, ...output.edges]) {
    if (!source.content.includes(proposal.source_excerpt)) {
      throw new Error("A proposed supporting excerpt is not present in the immutable source.");
    }
  }
}
