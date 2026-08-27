# ADR 0003: Hybrid bounded spreading activation

- Status: Accepted
- Date: 2026-08-27

## Context

Vector similarity alone misses explicit evidence, constraints, counterarguments, and learned relationships. Unbounded graph traversal would be expensive and could flood context with one dense cluster.

## Decision

Fuse vector and lexical seeds with reciprocal rank fusion, traverse active typed edges in both directions through a cycle-safe recursive CTE, cap depth at 3, decay activation by edge strength/confidence/depth, and rerank with explicit weighted components. Protect relevant contradictions, diversify by seed/type, and fit a structured trust-separated context pack to a caller token budget.

## Consequences

Retrieval is explainable and resilient when embeddings fail. Initial weights and decay are configuration, not truth, and require evaluation against the fixed fixture. The service records more audit data per request, which supports debugging and future tuning.
