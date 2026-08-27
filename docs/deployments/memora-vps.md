# Memora VPS deployment

Axelyn Knowledge runs on `memora_vps` as the `axelyn-knowledge` Docker Compose project. The application is bound to host loopback on port `3001`; PostgreSQL remains bound to loopback and is not publicly exposed.

## Database boundary

Knowledge uses the existing Axelyn Signal PostgreSQL 17 server process and Docker volume, but owns a separate `axelyn_knowledge` logical database and a restricted `axelyn_knowledge` login role. The Knowledge role is denied connection to `axelyn_signal`, and there are no cross-database grants or foreign keys.

Axelyn Signal currently connects as the cluster-initializing `axelyn` superuser. A PostgreSQL superuser can bypass database ACLs, so isolation is not symmetric until Signal is deliberately migrated to a restricted application role. That migration was not bundled into the Knowledge launch because changing Signal's credentials and operational migration path requires separate review.

The Signal PostgreSQL container uses the reproducible image recipe at `deploy/Dockerfile.postgres-pgvector`. It preserves the same PostgreSQL Alpine base and adds pgvector. The runtime image override is kept with this deployment, so Signal's source tree is not edited.

As deployed on 2026-08-27:

- Application release: `b48f012f60e3`
- PostgreSQL: `17.11`
- pgvector: `0.8.6`
- Pre-change Signal backup: `20260827T023854Z`

## Paths and lifecycle

- Release source and compose files: `/opt/axelyn-knowledge/source`
- Production environment: `/opt/axelyn-knowledge/.env` (`0600`)
- Generated credentials: `/opt/axelyn-knowledge/secrets` (`0700`)
- Pre-change database backups: `/opt/axelyn-knowledge/backups` (`0700`)
- Application endpoint on the VPS: `http://127.0.0.1:3001`

From `/opt/axelyn-knowledge/source`, operate the service with:

```bash
docker compose --env-file ../.env -f deploy/compose.production.yaml ps
docker compose --env-file ../.env -f deploy/compose.production.yaml logs --tail=100 knowledge
docker compose --env-file ../.env -f deploy/compose.production.yaml restart knowledge
```

Run future migrations before replacing the app:

```bash
docker compose --env-file ../.env -f deploy/compose.production.yaml \
  --profile tools run --rm migrate
```

Future recreation of the Signal database service must retain the pgvector image override:

```bash
cd /home/debian/apps/axelyn-signal/source
PGVECTOR_IMAGE_RELEASE=17.11-vector0.8.6 docker compose \
  --env-file .env \
  -f docker-compose.yml \
  -f /opt/axelyn-knowledge/source/deploy/compose.axelyn-signal-pgvector.yaml \
  up -d db
```

Running the original Signal Compose definition alone can recreate the database container with plain PostgreSQL, which does not contain the vector extension library.

## GitHub CI/CD

The `CI` workflow validates every push and pull request. A push to `main` receives a production deployment job only after formatting, linting, type checking, unit tests, migration validation, integration tests, the production build, and the Playwright journey pass.

The deployment job references the GitHub `production` environment. That environment is restricted to the `main` branch and contains only these deployment values:

- Environment variables: `MEMORA_VPS_HOST`, `MEMORA_VPS_PORT`, and `MEMORA_VPS_USER`
- Environment secrets: `MEMORA_VPS_SSH_PRIVATE_KEY` and `MEMORA_VPS_KNOWN_HOSTS`

Database, service-token, and model-provider credentials remain exclusively in `/opt/axelyn-knowledge/.env`; they are not copied into GitHub.

The SSH public key is installed for `debian` with a forced command and OpenSSH's `restrict` option. It cannot open an interactive shell, allocate a TTY, or create a tunnel. The forced command at `/opt/axelyn-knowledge/bin/github-deploy` accepts only:

```text
health
deploy <full-40-character-git-sha>
```

For each deployment, the VPS:

1. Acquires `/opt/axelyn-knowledge/deploy.lock` so releases cannot overlap.
2. Fetches `main` directly from the public GitHub repository and rejects the request unless the supplied SHA is the exact current head of `main`.
3. Builds SHA-tagged runner and migrator images.
4. Runs migrations before changing the active application.
5. Saves the current environment and source release.
6. Switches `/opt/axelyn-knowledge/source`, starts only the Knowledge service, and waits for readiness.
7. Restores the prior source, environment, and application image automatically if the new application does not become ready.
8. Verifies from GitHub that the public readiness URL still returns a Cloudflare Access redirect.

The application rollback does not reverse a completed database migration. Migrations merged to `main` must therefore remain backward-compatible with the preceding application release. Previous source trees, images, failed build trees, and environment backups are retained for investigation and explicit cleanup.

Rotate the deploy credential by generating a new Ed25519 key, installing its public half with the same forced-command restrictions, replacing `MEMORA_VPS_SSH_PRIVATE_KEY` in the GitHub `production` environment, testing `health`, and only then removing the old authorized key. Replace `MEMORA_VPS_KNOWN_HOSTS` only after verifying a deliberate VPS host-key rotation through a trusted channel.

## Exposure and operator access

Keep port `3001` loopback-only until a TLS route protected by Cloudflare Access is configured. The API can be called locally or through an explicitly configured private/proxied route. The administration interface requires a valid Cloudflare Access authenticated-user header in production; development identity mode cannot activate.

### Manual Cloudflare publication

The intended public hostname is `knowledge.axelyn.com`. Create the Access application before publishing the tunnel route so the hostname is never briefly public without identity enforcement.

1. In **Zero Trust → Access controls → Applications**, create a **Self-hosted and private** application named `Axelyn Knowledge` for `knowledge.axelyn.com`.
2. Attach the same reviewed reusable Allow policy and identity provider used by Axelyn Signal. Do not use an Everyone or Bypass policy.
3. Copy the new application's Audience (AUD) tag from its additional settings.
4. In **Networking → Tunnels**, open tunnel `4dd28c33-c748-4c9e-9469-8c7a18624524` and add a **Published application** route.
5. Set the hostname to `knowledge.axelyn.com` and the service URL to `http://knowledge:3000`.
6. Enable **Protect with Access**, using team name `proud-violet-f4f7` and the Knowledge application's AUD tag.
7. Save and verify that Cloudflare created a proxied CNAME to `4dd28c33-c748-4c9e-9469-8c7a18624524.cfargotunnel.com`.

Validate an allowed and a denied identity in separate private browser sessions. A request without an Access session should redirect to Access, while an allowed identity should receive the Knowledge UI. The Docker service alias is intentionally `knowledge`; do not use the shared name `app`, host loopback, or port `3001` as the tunnel origin.

Extraction and embedding provider credentials were intentionally left unset at launch. Source intake remains durable, extraction failures remain retryable, and retrieval falls back to lexical plus graph scoring. Configure reviewed provider models and credentials before expecting automatic extraction or semantic seeds.

## Manual rollback

Failed automated releases roll the application back without operator action. For a manual application rollback, restore the prior release tag and its matching source tree, then recreate `knowledge`. Migration rollback should normally use the pre-change backup rather than destructive down migrations once production data exists.

The PostgreSQL image can be rolled back without changing the volume by recreating the Signal `db` service from its original Compose file. Do this only if no Knowledge schema depends on pgvector, because PostgreSQL cannot load vector columns without the extension library. The pre-change Signal dump and role-only dump in `/opt/axelyn-knowledge/backups` are the recovery source.
