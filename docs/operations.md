# Operations

## Create the production database and restricted role

Run the role/database statements as a PostgreSQL administrator. Supply the password interactively or through your secret manager; do not paste it into shell history.

```sql
CREATE ROLE axelyn_knowledge LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
CREATE DATABASE axelyn_knowledge OWNER axelyn_knowledge;
REVOKE CONNECT ON DATABASE axelyn_knowledge FROM PUBLIC;
GRANT CONNECT ON DATABASE axelyn_knowledge TO axelyn_knowledge;
```

Connect to the new database as an administrator and enable pgvector:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO axelyn_knowledge;
```

Run migrations as the `axelyn_knowledge` role. The role owns only this logical database. Do not grant it privileges on the Axelyn Signal database, and do not create cross-database links.

## VPS deployment

The checked-in production definition is `deploy/compose.production.yaml`. The concrete `memora_vps` runbook is in [deployments/memora-vps.md](deployments/memora-vps.md).

1. Install Docker Engine/Compose or Node.js 24 and a process supervisor.
2. Clone a reviewed release and create `.env` with mode `0600`.
3. Set `DATABASE_URL` to the existing private PostgreSQL server's `axelyn_knowledge` database.
4. Configure long random service tokens, provider credentials if used, and `NODE_ENV=production`.
5. Build the application and migration images.
6. Run the migration target once, inspect success, then start the runner.
7. Put the runner behind a TLS reverse proxy and Cloudflare Access. Forward the Access user header and strip incoming client copies.
8. Probe `/health/live` for process liveness and `/health/ready` for database plus pgvector readiness.

```bash
docker build --target migrator -t axelyn-knowledge:migrator .
docker run --rm --env-file .env --network host axelyn-knowledge:migrator
docker build --target runner -t axelyn-knowledge:app .
docker run -d --name axelyn-knowledge --restart unless-stopped \
  --env-file .env --network host axelyn-knowledge:app
```

Do not use `--network host` if the database is reachable through a private Docker network; use the narrowest network available. Never publish PostgreSQL.

Application logs are one-line JSON. Capture stdout/stderr in journald or the host log collector, redact at ingestion, and alert on `database.pool_error`, `extraction.failed`, and readiness failures.

## Migrations

`npm run db:migrate` applies forward migrations under the migration table lock. The initial migration has a validated `down` path for empty/development databases. Once production contains knowledge, prefer expand/migrate/contract follow-up migrations and a database restore over destructive rollback. Back up before every schema change.

## Backup

Use PostgreSQL-native backups on the database server. A custom-format logical backup is portable and includes vector data:

```bash
pg_dump --format=custom --no-owner --file=axelyn_knowledge-$(date +%F).dump "$DATABASE_URL"
```

Encrypt backups, move them off-host, set retention, and test restore regularly. For larger deployments, add encrypted physical backups plus WAL archiving to support point-in-time recovery.

## Restore drill

Restore into a new empty database first; never overwrite the only production copy during a drill.

```bash
createdb axelyn_knowledge_restore_test
pg_restore --exit-on-error --no-owner \
  --dbname=postgresql://ROLE@HOST/axelyn_knowledge_restore_test \
  axelyn_knowledge-YYYY-MM-DD.dump
psql postgresql://ROLE@HOST/axelyn_knowledge_restore_test \
  -c "SELECT count(*) FROM knowledge_sources; SELECT extversion FROM pg_extension WHERE extname='vector';"
```

Run readiness and a representative retrieval against the restored database. Record row counts for sources, nodes, versions, retrieval runs, and usage before accepting the drill.

## Token rotation and incident response

Service tokens support overlap: add a new credential, restart, rotate the caller, observe success, remove the old credential, and restart again. Provider keys rotate independently. If a token leaks, revoke it first, inspect structured logs and retrieval/ingestion audit rows by service ID, then issue a replacement.
