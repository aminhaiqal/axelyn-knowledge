# Axelyn Signal integration

Axelyn Signal remains the system of record for pipelines, draft sessions, approvals, publication, and delivery. It sends complete immutable snapshots to the Axelyn Knowledge API and never writes the knowledge database.

## Event mapping

| Signal event                 | Knowledge `source_type` |
| ---------------------------- | ----------------------- |
| `signal.captured`            | `signal`                |
| `brief.generated`            | `generated_insight`     |
| `operator_evidence.supplied` | `operator_evidence`     |
| `draft.approved`             | `approved_revision`     |
| `draft.published`            | `published_artifact`    |
| `knowledge.corrected`        | `correction`            |

Use the Signal workspace, event aggregate UUID as `external_id`, and the aggregate revision as `source_version`. Retry the same tuple freely only when content, metadata, occurrence time, and verification assertion are identical. If an immutable field changes, increment `source_version`; the API rejects reuse of an existing identity with a different snapshot.

The [typed example client](../../examples/axelyn-signal-client.ts) implements this mapping.

## Approved revision example

```bash
curl -sS http://axelyn-knowledge.internal/api/v1/sources \
  -H "Authorization: Bearer $AXELYN_KNOWLEDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "axelyn",
    "source_system": "axelyn-signal",
    "source_type": "approved_revision",
    "external_id": "revision-6f55a4ba",
    "source_version": 4,
    "content": "Explainability is not a wall of telemetry. Show the evidence path, name uncertainty, and give the reviewer somewhere to intervene.",
    "metadata": {
      "event": "draft.approved",
      "platform": "LINKEDIN",
      "approved_at": "2026-08-27T09:30:00+08:00"
    },
    "occurred_at": "2026-08-27T09:30:00+08:00",
    "auto_extract": true
  }'
```

This source is `APPROVED_COPY`, but its INSERT records remain `UNVERIFIED` because no factual verification assertion was supplied. If an operator explicitly checked a statement, include a top-level `verification_assertion` with level, actor, and reason; do not infer it from `approved_at`.

The ingestion response succeeds even when extraction is unconfigured or unavailable. Inspect its extraction ID/status and retry with `POST /api/v1/sources/{sourceId}/extractions`.

## Retrieve context for the next LinkedIn draft

```bash
curl -sS http://axelyn-knowledge.internal/api/v1/context/retrieve \
  -H "Authorization: Bearer $AXELYN_KNOWLEDGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": "axelyn",
    "query": "How should we explain explainability to technology leaders in regulated systems?",
    "purpose": "Prepare a new LinkedIn draft",
    "requesting_system": "axelyn-signal",
    "audience": "Technology leaders in regulated industries",
    "desired_node_types": ["FACT", "OBSERVATION", "PRINCIPLE", "CLAIM", "EVIDENCE", "ARGUMENT", "INSIGHT"],
    "allowed_verification_levels": ["UNVERIFIED", "HUMAN_CONFIRMED", "SOURCE_SUPPORTED", "DISPUTED"],
    "maximum_sensitivity": "INTERNAL",
    "maximum_graph_depth": 2,
    "result_limit": 12,
    "token_budget": 1800,
    "pinned_node_ids": []
  }'
```

Signal should pass the structured `context_pack` to generation without collapsing sections. Preserve unverified labels and contradiction caveats in downstream prompts. After a workflow concludes, report selected node IDs and an outcome to `POST /api/v1/usage`; successful approval may improve capped usefulness but never factual verification.
