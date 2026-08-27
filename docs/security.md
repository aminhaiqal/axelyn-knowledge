# Security

## Identity modes

Service APIs require `Authorization: Bearer <token>`. MVP credentials are JSON-configured through `SERVICE_TOKENS`; each record binds a token ID to an explicit workspace allowlist. Comparisons hash both values to fixed-length buffers and use constant-time comparison. Tokens and authorization headers are never logged. Authentication failures intentionally share one generic response.

Rotate a token by adding the replacement, updating the caller, confirming traffic, then removing the old token and restarting the service. Persisted hashed credentials can replace the parser without changing the domain authorization interface.

The operator UI trusts `Cf-Access-Authenticated-User-Email` after the application is placed behind Cloudflare Access. The reverse proxy must strip any client-supplied copy and set the trusted header. Local identity requires both `ALLOW_DEV_OPERATOR=true` and `DEV_OPERATOR_EMAIL`; the code also requires `NODE_ENV !== production`, so this path cannot activate in production.

## Isolation

- Every API body/query is resolved against the authenticated token's workspace allowlist.
- Every database query includes `workspace_id`.
- Graph and provenance foreign keys use `(workspace_id, id)` pairs.
- Retrieval applies a caller-selected sensitivity ceiling before seed search and again after graph traversal.
- Cross-workspace behavior is covered by service and direct-database tests.

PostgreSQL credentials belong only to this service. Axelyn Signal and other consumers use the API and receive no table privileges.

## Untrusted content and model use

Source content has a 1 MB UTF-8 application and database limit and is stored as data. A streaming JSON reader also stops request bodies at 6.5 MB before parsing, which accommodates escaped source content while bounding metadata and allocation. The extraction system prompt states that every source string is untrusted, forbids invention, preserves attribution/uncertainty, and requires structured output only. Source data is JSON-encoded in a separate user message. Zod validates the response, endpoint IDs, enums, dimensions, confidence ranges, and excerpts; every excerpt must occur verbatim in the immutable source before a single proposal is applied.

Version one does not fetch URLs, crawl the web, or render source HTML. React escapes source strings in the operator interface.

## Secrets and network

- Store `.env` with mode `0600` or use the VPS secret manager.
- Never commit bearer or provider keys; `.env*` is ignored except `.env.example`.
- Bind PostgreSQL to localhost or a private network only. The Compose port is explicitly `127.0.0.1`.
- Expose the app through TLS and Access; do not expose port 3000 directly to the internet.
- Restrict outbound network access to configured extraction and embedding providers if the host firewall supports it.

## Audit and deletion

Sources, versions, retrieval paths, and usage provide the audit trail. The MVP intentionally preserves them. A future authorized erasure/redaction workflow must create a separately audited tombstone or cryptographic-redaction procedure; it must not reuse ordinary archive or merge operations.
