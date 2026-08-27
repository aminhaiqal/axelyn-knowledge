# Axelyn Knowledge

Axelyn Knowledge is a shared, provenance-aware associative memory service for Axelyn applications and agents. It stores immutable source episodes, atomic semantic knowledge, approved procedures and constraints, and bounded request-specific working memory without confusing generated interpretation, editorial approval, or factual verification.

## Architecture

```mermaid
flowchart LR
  Signal[Axelyn Signal and other services] -->|Bearer API: immutable source snapshot| API[Next.js App Router API]
  Operator[Operator through Cloudflare Access] -->|Review and correction| UI[Internal administration UI]
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

Every node carries four independent labels:

- Origin: who or what supplied the content.
- Verification: whether a human or source supports the claim.
- Lifecycle: whether knowledge is proposed, active, rejected, or archived.
- Sensitivity: the highest audience allowed to retrieve it.

Approving a proof or node changes editorial lifecycle and usefulness only. It does **not** change `UNVERIFIED` to a verified state. Repeated use can change a capped usefulness score; it also never changes verification. Corrections create revisions or explicit contradictions/superseding relationships instead of erasing history.

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

The seed builds a fixed explainability-in-regulated-systems graph containing a user signal, human-confirmed observation, unverified AI interpretation, supporting evidence, counterargument, approved positioning, voice pattern, and later correction.

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
- There is no web crawling, URL fetching, external deployment automation, or direct consumer database access.
