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

Source content has a 1 MB UTF-8 application and database limit and is stored as data. A streaming JSON reader also stops request bodies at 6.5 MB before parsing. Extraction and knowledge-operation prompts treat every source string and operator request as untrusted, forbid invention, preserve attribution and uncertainty, and require structured output. Zod validates operation/type boundaries, endpoint IDs, enums, confidence ranges, and excerpts; every excerpt must occur verbatim in the immutable source before a result is applied.

The operator console can import one public web page or PDF URL. Every URL and redirect is limited to HTTP(S) on standard ports, resolved before connection, and rejected if any resolved address is local, private, link-local, reserved, or documentation-only. The request uses a pinned resolved address to prevent DNS rebinding between validation and connection, follows at most three validated redirects, and enforces response size and timeout limits. HTML is parsed as inert data: scripts, styles, frames, forms, navigation, and hidden content are discarded; page JavaScript is never executed and linked pages are never crawled. React escapes the resulting source strings in the operator interface.

Uploaded documents are bounded to 8 MB. PDF extraction disables error recovery, limits image allocation and page count, and stores only the extracted text. Image-only scans are rejected when no readable text is present. Imported text remains untrusted source material under the same prompt and excerpt-validation boundaries as service API ingestion.

## Secrets and network

- Store `.env` with mode `0600` or use the VPS secret manager.
- Workspace OpenRouter keys are write-only in the operator UI and encrypted with AES-256-GCM before database storage. The 32-byte `CREDENTIAL_ENCRYPTION_KEY` remains in the VPS environment and is generated automatically by the production deploy runner when absent.
- Never commit bearer or provider keys; `.env*` is ignored except `.env.example`.
- Bind PostgreSQL to localhost or a private network only. The Compose port is explicitly `127.0.0.1`.
- Expose the app through TLS and Access; do not expose port 3000 directly to the internet.
- Allow outbound HTTP(S) only where required. Website intake needs public web access; private and local destinations remain blocked in the application even when host routing could reach them.

## Audit and deletion

Sources, versions, retrieval paths, and usage provide the audit trail. The MVP intentionally preserves them. A future authorized erasure/redaction workflow must create a separately audited tombstone or cryptographic-redaction procedure; it must not reuse ordinary archive or merge operations.
