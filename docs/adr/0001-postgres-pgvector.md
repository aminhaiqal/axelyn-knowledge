# ADR 0001: PostgreSQL property graph with pgvector

- Status: Accepted
- Date: 2026-08-27

## Context

Axelyn Knowledge needs immutable sources, normalized provenance, revisions, transactional graph edits, full-text search, vector similarity, workspace isolation, and operational simplicity. Production already operates PostgreSQL.

## Decision

Use PostgreSQL 17+ as the only datastore. Model the property graph with normalized node, edge, and source-link tables; use generated `tsvector` plus GIN for lexical search and pgvector `vector(1536)` plus HNSW cosine search for semantic seeds.

## Consequences

Graph changes and audit history share ACID transactions, and no second database is operated. Recursive CTEs are bounded to depth 3. PostgreSQL is not optimized for arbitrary unbounded graph analytics, which is explicitly outside the first release. Changing embedding dimension requires a deliberate migration and index rebuild because the dimension is a schema-level constant.
