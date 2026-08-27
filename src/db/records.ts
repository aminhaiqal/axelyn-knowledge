import type { KnowledgeNode, KnowledgeSource } from "@/src/domain/models";

const iso = (value: Date | string) => (value instanceof Date ? value.toISOString() : value);

export function mapSource(row: Record<string, unknown>): KnowledgeSource {
  return {
    ...(row as unknown as KnowledgeSource),
    source_version: Number(row.source_version),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    verification_assertion: (row.verification_assertion ??
      null) as KnowledgeSource["verification_assertion"],
    occurred_at: iso(row.occurred_at as Date | string),
    created_at: iso(row.created_at as Date | string),
  };
}

export function mapNode(row: Record<string, unknown>): KnowledgeNode {
  return {
    ...(row as unknown as KnowledgeNode),
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    confidence: Number(row.confidence),
    importance: Number(row.importance),
    salience: Number(row.salience),
    usefulness_score: Number(row.usefulness_score),
    current_version: Number(row.current_version),
    created_at: iso(row.created_at as Date | string),
    updated_at: iso(row.updated_at as Date | string),
    archived_at: row.archived_at ? iso(row.archived_at as Date | string) : null,
  };
}

export function vectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
