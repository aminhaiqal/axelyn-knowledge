# Axelyn Knowledge

Axelyn Knowledge is a shared, provenance-aware associative memory service for Axelyn applications and agents. Every atomic record belongs to exactly one operation: INSERT adds knowledge, CHALLENGE tests existing knowledge, and EXTEND develops it. Generated interpretation, activation, and factual verification remain separate.

## Architecture

```mermaid
flowchart LR
  Signal[Axelyn Signal and other services] -->|Bearer API: immutable source snapshot| API[Next.js App Router API]
  Operator[Operator through Cloudflare Access] -->|Capture and correction| UI[Internal administration UI]
  API --> Domain[Trust, provenance and review services]
  UI --> Domain
  Domain --> Extract[Provider-neutral extraction gateway]
  Domain --> Embed[Provider-neutral embedding gateway]
  Domain --> PG[(PostgreSQL 17 + pgvector)]
  PG --> Retrieve[Lexical + vector seeds]
  Retrieve --> Graph[Bounded spreading activation]
  Graph --> Pack[Structured working-memory pack]
  Pack --> Signal
```

The Next.js service is the only writer. PostgreSQL owns immutable source snapshots, the property graph, revision history, retrieval audits, usage, and an outbox. Production may share the same PostgreSQL **server** as Axelyn Signal, but Axelyn Knowledge uses its own `axelyn_knowledge` logical database and restricted role. There are no cross-database foreign keys or consumer writes.

See [architecture](docs/architecture.md), [knowledge model](docs/knowledge-model.md), and [retrieval design](docs/retrieval.md).

## Trust model

Every node carries one exclusive operation plus four independent trust labels:

- Operation: `INSERT`, `CHALLENGE`, or `EXTEND`.

- Origin: who or what supplied the content.
- Verification: whether a human or source supports the statement.
- Lifecycle: whether knowledge is active, rejected, archived, or retained in a legacy proposed state.
- Sensitivity: the highest audience allowed to retrieve it.

Knowledge is active immediately; there is no human-review Inbox. Automatic activation does **not** change `UNVERIFIED` to a verified state. PostgreSQL enforces the operation/type partition, so one record cannot belong to more than one operation. Repeated use can change a capped usefulness score but never verification. Corrections create revisions or explicit relationships instead of erasing history.

## Local setup

Requirements: Node.js 24+, Docker with Compose, and about 1 GB for dependencies and the PostgreSQL image.

```bash
cp .env.example .env
# Replace the example SERVICE_TOKENS secret in .env.
docker compose up -d db
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:3000>. The example environment enables the development-only operator identity. It is hard-disabled whenever `NODE_ENV=production`.

The seed builds a fixed explainability-in-regulated-systems graph spanning inserted observations, principles and procedures, challenge evidence, and extended arguments and insights.

## Add knowledge from the operator console

Open **Insert** in the sidebar to create a source from:

- pasted notes, transcripts, research, or drafts;
- PDF, TXT, Markdown, CSV, JSON, or HTML files up to 8 MB; or
- one public web page or PDF URL.

The console preserves readable source text as immutable provenance, then classifies each atomic INSERT record as `FACT`, `OBSERVATION`, `PRINCIPLE`, `DECISION`, or `PROCEDURE`. By default, one OpenRouter key drives a cost-aware cascade: Gemini 2.5 Flash Lite handles routine structured classification and first-pass grounded operations, GPT-5 Mini adjudicates valid CHALLENGE judgments or retries invalid routine output, and Claude Sonnet 4.6 is the final fallback. Set `EXTRACTION_MODELS` to override that order or the legacy `EXTRACTION_MODEL` to force one model. Inserted knowledge becomes `ACTIVE` immediately but remains `UNVERIFIED` unless the source carries an explicit verification assertion.

**Challenge** retrieves one existing target and bounded supporting context, then creates one separate `CLAIM`, `EVIDENCE`, or `HYPOTHESIS` with supporting analysis, opposing analysis, uncertainty, and evidence gaps. **Extend** creates one linked `ARGUMENT` or `INSIGHT` that adds a distinct implication. Both operations leave the target unchanged and store the selected model and retrieval audit.

PDF import supports text-based documents with up to 150 pages; image-only scans require OCR before upload. Website import fetches one public page without executing JavaScript or following links. Local and private network destinations are blocked. If extraction is not configured, the source is still saved and the failed attempt appears on the Register. Configure `EXTRACTION_API_KEY` (or `OPENROUTER_API_KEY`) to enable the default cascade.

Operators can also configure a workspace-specific OpenRouter key and model cascade from **Settings → Model access**. Workspace keys are validated with OpenRouter, encrypted with AES-256-GCM before database storage, and never returned to the browser. Workspace settings take precedence over the optional server environment fallback.

### Migration and seed commands

```bash
npm run db:migrate       # apply pending migrations
npm run db:migrate:down  # roll back one migration; development/validated rollback only
npm run db:seed          # idempotent evaluation fixture
```

For the containerized application:

```bash
docker compose --profile tools run --rm migrate
docker compose up --build -d app
```

## Validation

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
TEST_DATABASE_URL=postgresql://axelyn_knowledge:axelyn_knowledge@127.0.0.1:5432/axelyn_knowledge_test npm run test:integration
npm run build
npx playwright install chromium
npm run test:e2e
```

Integration tests require a migrated test database. The CI workflow provisions PostgreSQL with pgvector, migrates it from empty, and runs the full sequence.

## API overview

The service-to-service API is under `/api/v1` and uses bearer authentication. Health endpoints are also aliased at `/health/live` and `/health/ready` for infrastructure probes.

- `POST /api/v1/sources`: immutable, idempotent source ingestion.
- `POST /api/v1/sources/{id}/extractions`: extraction/retry.
- `/api/v1/knowledge/*`: review, edit, merge, archive, list, and neighborhood operations.
- `POST /api/v1/context/retrieve`: hybrid bounded associative retrieval.
- `POST /api/v1/usage`: downstream outcome and capped usefulness reinforcement.

The maintained [OpenAPI 3.1 specification](openapi.yaml) defines the complete surface and uniform error envelope. See the [Axelyn Signal integration](docs/integrations/axelyn-signal.md) and [typed client](examples/axelyn-signal-client.ts).

## Operations and security

- [Security and identity](docs/security.md)
- [VPS deployment, database role, backups, restore, and token rotation](docs/operations.md)
- [PostgreSQL/pgvector ADR](docs/adr/0001-postgres-pgvector.md)
- [Trust and provenance ADR](docs/adr/0002-trust-and-provenance.md)
- [Associative retrieval ADR](docs/adr/0003-associative-retrieval.md)

## Current limitations

- Extraction and embeddings are synchronous adapters in the MVP; failed attempts are durable and retryable, but a dedicated queue worker is not yet included.
- The environment-token credential store is intentionally replaceable; persisted hashed service credentials and a management API are future work.
- Token estimation is deterministic and conservative, not model-tokenizer exact.
- English PostgreSQL text search is configured for the first release.
- Embedding similarity creates suggestions only; all merges require a human decision.
- Consolidation primitives exist, but no autonomous consolidation agent or physical forgetting process runs.
- Operator website intake fetches one public page only. It does not crawl links, execute page JavaScript, access authenticated pages, or render client-only sites.
- There is no external deployment automation or direct consumer database access.
