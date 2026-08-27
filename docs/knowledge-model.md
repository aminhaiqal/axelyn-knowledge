# Knowledge model

## Memory layers

- Episodic memory: `knowledge_sources` contains immutable event and experience snapshots.
- Semantic memory: atomic nodes and typed relationships encode reusable claims, evidence, entities, concepts, observations, and positions.
- Procedural memory: constraint and voice-pattern nodes encode approved working rules.
- Working memory: each retrieval run records a bounded activated subgraph and structured context pack.

Whole documents stay in source snapshots. A semantic node should normally be one reusable statement.

An `ARTIFACT` node is a compact identity anchor, not a copy of a document. Approved-revision extraction creates or reuses one proposal and links every reusable extracted idea to it with `EXPRESSED_IN`; the full approved content remains only in the immutable source snapshot.

## Explicit vocabulary

Node types: `EPISODE`, `SIGNAL`, `OBSERVATION`, `CLAIM`, `CONCEPT`, `ENTITY`, `EXPERIENCE`, `EVIDENCE`, `CONSTRAINT`, `COUNTERARGUMENT`, `POSITION`, `AUDIENCE_INSIGHT`, `VOICE_PATTERN`, and `ARTIFACT`.

Directed edge types: `DERIVED_FROM`, `SUPPORTS`, `CONTRADICTS`, `REFINES`, `SUPERSEDES`, `CAUSES`, `APPLIES_TO`, `EXAMPLE_OF`, `ABOUT`, `USED_IN`, `EXPRESSED_IN`, and `RELATED_TO`.

Application validation and PostgreSQL enums both reject arbitrary values.

## Independent trust dimensions

| Dimension    | Values                                                            | Meaning                       |
| ------------ | ----------------------------------------------------------------- | ----------------------------- |
| Origin       | USER_SIGNAL, OPERATOR, AI_DERIVED, APPROVED_COPY, EXTERNAL_SOURCE | Where the statement came from |
| Verification | UNVERIFIED, HUMAN_CONFIRMED, SOURCE_SUPPORTED, DISPUTED           | Evidentiary status            |
| Lifecycle    | PROPOSED, ACTIVE, REJECTED, ARCHIVED                              | Editorial/operational state   |
| Sensitivity  | PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED                        | Retrieval ceiling             |

`approve` changes lifecycle to `ACTIVE`; it copies verification unchanged. A source may carry an explicit human verification assertion, including actor and reason. Without one, approved copy remains `APPROVED_COPY / UNVERIFIED`.

## Tables and invariants

- `workspaces`: isolation root.
- `knowledge_sources`: immutable snapshots and idempotency key.
- `knowledge_extractions`: attempt, provider, success proposals, or auditable failure.
- `knowledge_nodes` and `knowledge_edges`: current graph state.
- `knowledge_node_versions` and `knowledge_edge_versions`: append-only state history.
- `knowledge_node_sources` and `knowledge_edge_sources`: compact supporting excerpts.
- `knowledge_node_aliases`: statements preserved through a merge.
- `retrieval_runs` and `retrieval_run_items`: input constraints, seeds, scores, paths, selection, and context pack.
- `knowledge_usage`: supplied nodes and later consumer outcomes.
- `outbox_events`: domain events committed with their aggregate changes.

Confidence, strength, importance, and salience are database-constrained to `[0,1]`. Usefulness is capped to `[0.1,0.9]`. Composite `(workspace_id, id)` foreign keys make cross-workspace edges and provenance links impossible even if application checks regress.

## Versioning, corrections, and superseding

Every node has `current_version`. PATCH requires `expected_version`; stale writes return a conflict. Every accepted change writes the new snapshot to the version table. Source snapshots cannot update or delete because of a database trigger.

Corrections should create a new version for wording/trust metadata, a distinct contradicting node when both claims must remain visible, or an explicit superseding node when replacement is intended. Archive changes retrieval eligibility without deleting audit history.

## Deduplication and merge

Canonical statements are normalized and hashed. Exact hashes and vector cosine similarity can create duplicate suggestions. Neither automatically merges records. A human merge:

1. locks both node versions;
2. blocks pairs connected by `CONTRADICTS`;
3. copies source excerpts and preserves the old statement as an alias;
4. migrates graph edges, archiving any relationship that would become a self-edge;
5. archives the source node;
6. records both node and edge revisions;
7. adds a sourced `SUPERSEDES` edge when provenance exists.

This is the consolidation primitive described in [architecture](architecture.md); no background consolidation agent runs in the MVP.
