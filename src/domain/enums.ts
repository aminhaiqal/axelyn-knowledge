export const NODE_TYPES = [
  "EPISODE",
  "SIGNAL",
  "OBSERVATION",
  "CLAIM",
  "CONCEPT",
  "ENTITY",
  "EXPERIENCE",
  "EVIDENCE",
  "CONSTRAINT",
  "COUNTERARGUMENT",
  "POSITION",
  "AUDIENCE_INSIGHT",
  "VOICE_PATTERN",
  "ARTIFACT",
] as const;

export const EDGE_TYPES = [
  "DERIVED_FROM",
  "SUPPORTS",
  "CONTRADICTS",
  "REFINES",
  "SUPERSEDES",
  "CAUSES",
  "APPLIES_TO",
  "EXAMPLE_OF",
  "ABOUT",
  "USED_IN",
  "EXPRESSED_IN",
  "RELATED_TO",
] as const;

export const ORIGINS = [
  "USER_SIGNAL",
  "OPERATOR",
  "AI_DERIVED",
  "APPROVED_COPY",
  "EXTERNAL_SOURCE",
] as const;

export const VERIFICATION_LEVELS = [
  "UNVERIFIED",
  "HUMAN_CONFIRMED",
  "SOURCE_SUPPORTED",
  "DISPUTED",
] as const;

export const LIFECYCLE_STATUSES = ["PROPOSED", "ACTIVE", "REJECTED", "ARCHIVED"] as const;
export const SENSITIVITY_LEVELS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;

export const SOURCE_TYPES = [
  "signal",
  "generated_insight",
  "operator_evidence",
  "approved_revision",
  "published_artifact",
  "external_source",
  "correction",
] as const;

export const EXTRACTION_STATUSES = ["PENDING", "RUNNING", "SUCCEEDED", "FAILED"] as const;

export const USAGE_OUTCOMES = [
  "SUPPLIED",
  "USED",
  "IGNORED",
  "HELPED_APPROVAL",
  "CONTRIBUTED_TO_REJECTION",
  "CORRECTED",
  "CONTRADICTED",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];
export type EdgeType = (typeof EDGE_TYPES)[number];
export type Origin = (typeof ORIGINS)[number];
export type Verification = (typeof VERIFICATION_LEVELS)[number];
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];
export type Sensitivity = (typeof SENSITIVITY_LEVELS)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];
export type UsageOutcome = (typeof USAGE_OUTCOMES)[number];

export const SENSITIVITY_RANK: Record<Sensitivity, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

export const VERIFICATION_SCORE: Record<Verification, number> = {
  UNVERIFIED: 0.25,
  HUMAN_CONFIRMED: 0.85,
  SOURCE_SUPPORTED: 1,
  DISPUTED: 0.1,
};
