# Associative retrieval

## Pipeline

1. Validate workspace, trust, sensitivity, graph depth (`0–3`), result count, and token budget.
2. Embed the query when the embedding gateway is available.
3. Retrieve up to 30 cosine-similarity vector seeds.
4. Retrieve up to 30 PostgreSQL full-text seeds using an OR query over normalized query terms.
5. Fuse ranks with normalized reciprocal rank fusion: `RRF(d) = Σ 1 / (60 + rank(d))`.
6. Traverse active edges in both directions with a cycle-safe recursive CTE. Depth defaults to 2 and cannot exceed 3; each expansion is capped at 24 strongest adjacent edges, with contradictions ordered first.
7. Propagate activation per hop: `parent × strength × confidence × 0.72`.
8. Score each candidate with inspectable components.
9. Retain a directly relevant contradiction, then greedily diversify by root seed and node type.
10. Fit full atomic items and compact provenance into the requested token budget. Reject a request when its query and required working-memory envelope cannot fit by themselves.
11. Persist the run, seeds, components, selected paths, context pack, and supplied usage.

Traversal is bidirectional for associative recall while paths retain `IN`/`OUT` direction and the original directed edge type.

## Scoring

| Component                    | Weight |
| ---------------------------- | -----: |
| Semantic relevance           |   0.35 |
| Lexical relevance            |   0.10 |
| Graph activation             |   0.20 |
| Verification and confidence  |   0.15 |
| Importance and salience      |   0.10 |
| Recency and prior usefulness |   0.10 |

The weighted sum, every component, and graph path are returned and stored. Ties use stable node IDs, and tests freeze time for deterministic evaluation. The configuration lives in `src/domain/scoring.ts`.

Verification factors intentionally rank `SOURCE_SUPPORTED` and `HUMAN_CONFIRMED` above `UNVERIFIED`; `DISPUTED` remains eligible only when requested. This is ranking, not verification. Recency decays exponentially over roughly a year. Historical usefulness is capped and cannot overpower the other signals.

When embeddings fail, semantic relevance is zero and lexical/graph stages continue. The response states `embedding_available: false`.

## Contradictions and diversification

Active `CONTRADICTS` edges are loaded for the candidate set. When the top candidate has a reachable contradiction, the best such node is protected during selection, subject to the caller's explicit sensitivity, verification, depth, and token ceilings. Constraints and counterarguments are also exempt from ordinary cluster caps. Contradictions are returned both as items and compact cross-references.

## Working-memory contract

The context pack is a structured object, never one flattened prose block. Its sections are:

- verified/supportable knowledge;
- user-supplied observations;
- unverified generated insights;
- constraints and prohibited claims;
- contradictions and caveats;
- prior approved positioning;
- voice patterns.

Each item includes trust labels and compact provenance. Unverified and disputed items include explicit downstream caveats. Token estimation is deterministic (`max(words × 1.3, characters / 4)`) over the serialized envelope and each serialized entry. This intentionally over-allocates repeated JSON structure; the service returns a validation error if the base envelope alone exceeds the requested budget.

## Usage reinforcement

Every selected node receives a `SUPPLIED` record with its path. A consumer can later report `USED`, `IGNORED`, `HELPED_APPROVAL`, `CONTRIBUTED_TO_REJECTION`, `CORRECTED`, or `CONTRADICTED`. Deterministic deltas update usefulness within `[0.1,0.9]`. Usage does not refresh the node's content-revision timestamp, so reinforcement cannot also masquerade as recency. No outcome modifies factual verification, and no physical forgetting occurs; revision recency decay and archival control retrieval.
