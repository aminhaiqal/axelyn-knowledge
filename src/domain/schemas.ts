import { z } from "zod";
import { MAX_SOURCE_BYTES } from "@/src/config";
import {
  EDGE_TYPES,
  LIFECYCLE_STATUSES,
  NODE_TYPES,
  ORIGINS,
  SENSITIVITY_LEVELS,
  SOURCE_TYPES,
  USAGE_OUTCOMES,
  VERIFICATION_LEVELS,
} from "@/src/domain/enums";

export const WorkspaceIdSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use lowercase letters, digits, underscores, or hyphens.");

export const UuidSchema = z.string().uuid();
export const NodeTypeSchema = z.enum(NODE_TYPES);
export const EdgeTypeSchema = z.enum(EDGE_TYPES);
export const OriginSchema = z.enum(ORIGINS);
export const VerificationSchema = z.enum(VERIFICATION_LEVELS);
export const LifecycleSchema = z.enum(LIFECYCLE_STATUSES);
export const SensitivitySchema = z.enum(SENSITIVITY_LEVELS);

const MetadataSchema = z.record(z.string(), z.unknown()).default({});

export const VerificationAssertionSchema = z.object({
  level: z.enum(["HUMAN_CONFIRMED", "SOURCE_SUPPORTED"]),
  actor: z.string().min(1).max(200),
  reason: z.string().min(3).max(2_000),
});

export const SourceIngestionSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  source_system: z.string().trim().min(1).max(100),
  source_type: z.enum(SOURCE_TYPES),
  external_id: z.string().trim().min(1).max(300),
  source_version: z.number().int().positive().max(2_147_483_647),
  content: z
    .string()
    .min(1)
    .max(MAX_SOURCE_BYTES)
    .refine(
      (value) => new TextEncoder().encode(value).byteLength <= MAX_SOURCE_BYTES,
      `Source content must not exceed ${MAX_SOURCE_BYTES} UTF-8 bytes.`,
    ),
  metadata: MetadataSchema,
  occurred_at: z.iso.datetime({ offset: true }),
  verification_assertion: VerificationAssertionSchema.optional(),
  auto_extract: z.boolean().default(true),
});

export const NodeCreateSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  type: NodeTypeSchema,
  title: z.string().trim().min(1).max(240),
  canonical_statement: z.string().trim().min(1).max(4_000),
  metadata: MetadataSchema,
  origin: OriginSchema,
  verification: VerificationSchema.default("UNVERIFIED"),
  lifecycle_status: LifecycleSchema.default("PROPOSED"),
  sensitivity: SensitivitySchema.default("INTERNAL"),
  confidence: z.number().min(0).max(1).default(0.5),
  importance: z.number().min(0).max(1).default(0.5),
  salience: z.number().min(0).max(1).default(0.5),
  source_links: z
    .array(
      z.object({
        source_id: UuidSchema,
        excerpt: z.string().trim().min(1).max(4_000),
      }),
    )
    .max(50)
    .default([]),
});

export const NodePatchSchema = z
  .object({
    expected_version: z.number().int().positive(),
    title: z.string().trim().min(1).max(240).optional(),
    canonical_statement: z.string().trim().min(1).max(4_000).optional(),
    metadata: MetadataSchema.optional(),
    verification: VerificationSchema.optional(),
    sensitivity: SensitivitySchema.optional(),
    confidence: z.number().min(0).max(1).optional(),
    importance: z.number().min(0).max(1).optional(),
    salience: z.number().min(0).max(1).optional(),
    change_reason: z.string().trim().min(3).max(1_000),
  })
  .refine(
    (value) =>
      Object.keys(value).some((key) => !["expected_version", "change_reason"].includes(key)),
    "At least one editable field is required.",
  );

export const EdgeCreateSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  source_node_id: UuidSchema,
  target_node_id: UuidSchema,
  type: EdgeTypeSchema,
  strength: z.number().min(0).max(1).default(0.5),
  confidence: z.number().min(0).max(1).default(0.5),
  lifecycle_status: LifecycleSchema.default("PROPOSED"),
  provenance: MetadataSchema,
  source_links: z
    .array(z.object({ source_id: UuidSchema, excerpt: z.string().trim().min(1).max(4_000) }))
    .min(1)
    .max(50),
});

export const MergeSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  target_node_id: UuidSchema,
  expected_source_version: z.number().int().positive(),
  expected_target_version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(1_000),
});

export const CursorSchema = z.object({
  cursor: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().max(500).optional(),
  ),
  limit: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.number().int().min(1).max(100).default(25),
  ),
});

export const NodeListQuerySchema = CursorSchema.extend({
  workspace_id: WorkspaceIdSchema,
  query: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().max(500).optional(),
  ),
  type: z.preprocess((value) => (value === "" ? undefined : value), NodeTypeSchema.optional()),
  origin: z.preprocess((value) => (value === "" ? undefined : value), OriginSchema.optional()),
  verification: z.preprocess(
    (value) => (value === "" ? undefined : value),
    VerificationSchema.optional(),
  ),
  lifecycle_status: z.preprocess(
    (value) => (value === "" ? undefined : value),
    LifecycleSchema.optional(),
  ),
  sensitivity: z.preprocess(
    (value) => (value === "" ? undefined : value),
    SensitivitySchema.optional(),
  ),
});

export const RetrievalSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  query: z.string().trim().min(1).max(2_000),
  purpose: z.string().trim().min(1).max(500),
  requesting_system: z.string().trim().min(1).max(100),
  audience: z.string().trim().max(500).default("general"),
  desired_node_types: z.array(NodeTypeSchema).max(NODE_TYPES.length).default([]),
  allowed_verification_levels: z
    .array(VerificationSchema)
    .min(1)
    .default([...VERIFICATION_LEVELS]),
  maximum_sensitivity: SensitivitySchema.default("INTERNAL"),
  maximum_graph_depth: z.number().int().min(0).max(3).default(2),
  result_limit: z.number().int().min(1).max(50).default(12),
  token_budget: z.number().int().min(64).max(32_000).default(2_000),
  pinned_node_ids: z.array(UuidSchema).max(25).default([]),
});

export const UsageSchema = z.object({
  workspace_id: WorkspaceIdSchema,
  retrieval_run_id: UuidSchema,
  node_ids: z.array(UuidSchema).min(1).max(100),
  outcome: z.enum(USAGE_OUTCOMES).exclude(["SUPPLIED"]),
  metadata: MetadataSchema,
});

export const NeighborhoodQuerySchema = z.object({
  workspace_id: WorkspaceIdSchema,
  depth: z.coerce.number().int().min(1).max(3).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const ExtractionNodeSchema = z.object({
  temp_id: z.string().trim().min(1).max(100),
  type: NodeTypeSchema,
  title: z.string().trim().min(1).max(240),
  canonical_statement: z.string().trim().min(1).max(4_000),
  metadata: MetadataSchema,
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1).default(0.5),
  salience: z.number().min(0).max(1).default(0.5),
  sensitivity: SensitivitySchema.default("INTERNAL"),
  source_excerpt: z.string().trim().min(1).max(4_000),
  suggested_duplicate_candidates: z.array(z.string().uuid()).max(10).default([]),
  potential_contradictions: z.array(z.string().uuid()).max(10).default([]),
  rationale: z.string().trim().min(1).max(1_000),
});

export const ExtractionEdgeSchema = z.object({
  source_temp_id: z.string().trim().min(1).max(100),
  target_temp_id: z.string().trim().min(1).max(100),
  type: EdgeTypeSchema,
  strength: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  source_excerpt: z.string().trim().min(1).max(4_000),
  rationale: z.string().trim().min(1).max(1_000),
});

export const ExtractionOutputSchema = z
  .object({
    nodes: z.array(ExtractionNodeSchema).max(100),
    edges: z.array(ExtractionEdgeSchema).max(200),
    audit_summary: z.string().trim().min(1).max(2_000),
  })
  .superRefine((value, context) => {
    const ids = new Set(value.nodes.map((node) => node.temp_id));
    if (ids.size !== value.nodes.length) {
      context.addIssue({ code: "custom", message: "Extraction temp_id values must be unique." });
    }
    value.edges.forEach((edge, index) => {
      if (!ids.has(edge.source_temp_id) || !ids.has(edge.target_temp_id)) {
        context.addIssue({
          code: "custom",
          path: ["edges", index],
          message: "Every extraction edge endpoint must reference a proposed node.",
        });
      }
    });
  });

export type SourceIngestionInput = z.infer<typeof SourceIngestionSchema>;
export type NodeCreateInput = z.infer<typeof NodeCreateSchema>;
export type NodePatchInput = z.infer<typeof NodePatchSchema>;
export type EdgeCreateInput = z.infer<typeof EdgeCreateSchema>;
export type RetrievalInput = z.infer<typeof RetrievalSchema>;
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;
