import type {
  EdgeType,
  KnowledgeOperation,
  LifecycleStatus,
  NodeType,
  Origin,
  Sensitivity,
  Verification,
} from "@/src/domain/enums";

export interface KnowledgeSource {
  id: string;
  workspace_id: string;
  source_system: string;
  source_type: string;
  external_id: string;
  source_version: number;
  content: string;
  metadata: Record<string, unknown>;
  content_hash: string;
  occurred_at: string;
  verification_assertion: {
    level: "HUMAN_CONFIRMED" | "SOURCE_SUPPORTED";
    actor: string;
    reason: string;
  } | null;
  created_by: string;
  created_at: string;
}

export interface KnowledgeNode {
  id: string;
  workspace_id: string;
  operation: KnowledgeOperation;
  type: NodeType;
  title: string;
  canonical_statement: string;
  statement_hash: string;
  metadata: Record<string, unknown>;
  origin: Origin;
  verification: Verification;
  lifecycle_status: LifecycleStatus;
  sensitivity: Sensitivity;
  confidence: number;
  importance: number;
  salience: number;
  usefulness_score: number;
  current_version: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface KnowledgeEdge {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  type: EdgeType;
  strength: number;
  confidence: number;
  lifecycle_status: LifecycleStatus;
  provenance: Record<string, unknown>;
  current_version: number;
  created_by: string;
  created_at: string;
  valid_from: string | null;
  valid_until: string | null;
}

export interface ProvenanceReference {
  source_id: string;
  source_system: string;
  source_type: string;
  external_id: string;
  source_version: number;
  excerpt: string;
}

export interface ScoreComponents {
  semantic_relevance: number;
  lexical_relevance: number;
  graph_activation: number;
  verification_confidence: number;
  importance_salience: number;
  recency_usefulness: number;
}
