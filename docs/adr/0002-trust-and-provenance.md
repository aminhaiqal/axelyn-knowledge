# ADR 0002: Independent trust and immutable provenance

- Status: Accepted
- Date: 2026-08-27

## Context

User signals, model interpretations, approved prose, operator evidence, and external sources have different evidentiary meaning. A single “approved” or confidence flag would silently turn editorial judgment into factual verification.

## Decision

Represent origin, verification, lifecycle, and sensitivity as independent enums. Store complete source snapshots immutably and require excerpts for every extracted node and edge. Approval changes lifecycle only. Verification changes require an explicit reviewed update or source assertion and are revisioned.

## Consequences

Consumers receive more metadata and must preserve labels, but they can safely distinguish supportable knowledge, observation, interpretation, positioning, and contradiction. Audit history is larger because corrections append rather than overwrite; this is an intentional product property.
