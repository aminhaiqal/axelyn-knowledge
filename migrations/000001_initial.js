exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TYPE knowledge_node_type AS ENUM (
      'EPISODE', 'SIGNAL', 'OBSERVATION', 'CLAIM', 'CONCEPT', 'ENTITY',
      'EXPERIENCE', 'EVIDENCE', 'CONSTRAINT', 'COUNTERARGUMENT', 'POSITION',
      'AUDIENCE_INSIGHT', 'VOICE_PATTERN', 'ARTIFACT'
    );
    CREATE TYPE knowledge_edge_type AS ENUM (
      'DERIVED_FROM', 'SUPPORTS', 'CONTRADICTS', 'REFINES', 'SUPERSEDES',
      'CAUSES', 'APPLIES_TO', 'EXAMPLE_OF', 'ABOUT', 'USED_IN',
      'EXPRESSED_IN', 'RELATED_TO'
    );
    CREATE TYPE knowledge_origin AS ENUM (
      'USER_SIGNAL', 'OPERATOR', 'AI_DERIVED', 'APPROVED_COPY', 'EXTERNAL_SOURCE'
    );
    CREATE TYPE knowledge_verification AS ENUM (
      'UNVERIFIED', 'HUMAN_CONFIRMED', 'SOURCE_SUPPORTED', 'DISPUTED'
    );
    CREATE TYPE knowledge_lifecycle AS ENUM ('PROPOSED', 'ACTIVE', 'REJECTED', 'ARCHIVED');
    CREATE TYPE knowledge_sensitivity AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED');
    CREATE TYPE knowledge_extraction_status AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');
    CREATE TYPE knowledge_usage_outcome AS ENUM (
      'SUPPLIED', 'USED', 'IGNORED', 'HELPED_APPROVAL',
      'CONTRIBUTED_TO_REJECTION', 'CORRECTED', 'CONTRADICTED'
    );

    CREATE TABLE workspaces (
      id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE knowledge_sources (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL REFERENCES workspaces(id),
      source_system text NOT NULL CHECK (char_length(source_system) BETWEEN 1 AND 100),
      source_type text NOT NULL CHECK (source_type IN (
        'signal', 'generated_insight', 'operator_evidence', 'approved_revision',
        'published_artifact', 'external_source', 'correction'
      )),
      external_id text NOT NULL CHECK (char_length(external_id) BETWEEN 1 AND 300),
      source_version integer NOT NULL CHECK (source_version > 0),
      content text NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 1000000),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
      content_hash character(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
      occurred_at timestamptz NOT NULL,
      verification_assertion jsonb,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, source_system, source_type, external_id, source_version),
      UNIQUE (workspace_id, id)
    );

    CREATE TABLE knowledge_extractions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL,
      source_id uuid NOT NULL,
      status knowledge_extraction_status NOT NULL DEFAULT 'PENDING',
      attempt integer NOT NULL DEFAULT 1 CHECK (attempt > 0),
      gateway text,
      model text,
      proposals jsonb,
      error_code text,
      error_message text,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      completed_at timestamptz,
      FOREIGN KEY (workspace_id, source_id)
        REFERENCES knowledge_sources(workspace_id, id),
      UNIQUE (source_id, attempt),
      UNIQUE (workspace_id, id)
    );

    CREATE TABLE knowledge_nodes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL REFERENCES workspaces(id),
      type knowledge_node_type NOT NULL,
      title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 240),
      canonical_statement text NOT NULL CHECK (char_length(canonical_statement) BETWEEN 1 AND 4000),
      statement_hash character(64) NOT NULL CHECK (statement_hash ~ '^[a-f0-9]{64}$'),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
      origin knowledge_origin NOT NULL,
      verification knowledge_verification NOT NULL DEFAULT 'UNVERIFIED',
      lifecycle_status knowledge_lifecycle NOT NULL DEFAULT 'PROPOSED',
      sensitivity knowledge_sensitivity NOT NULL DEFAULT 'INTERNAL',
      confidence numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
      importance numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (importance BETWEEN 0 AND 1),
      salience numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (salience BETWEEN 0 AND 1),
      usefulness_score numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (usefulness_score BETWEEN 0.1 AND 0.9),
      current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
      embedding vector(1536),
      search_document tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title, '') || ' ' || coalesce(canonical_statement, ''))
      ) STORED,
      created_by text NOT NULL,
      updated_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz,
      UNIQUE (workspace_id, id)
    );

    CREATE TABLE knowledge_node_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL,
      node_id uuid NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      title text NOT NULL,
      canonical_statement text NOT NULL,
      statement_hash character(64) NOT NULL,
      metadata jsonb NOT NULL,
      origin knowledge_origin NOT NULL,
      verification knowledge_verification NOT NULL,
      lifecycle_status knowledge_lifecycle NOT NULL,
      sensitivity knowledge_sensitivity NOT NULL,
      confidence numeric(5,4) NOT NULL,
      importance numeric(5,4) NOT NULL,
      salience numeric(5,4) NOT NULL,
      usefulness_score numeric(5,4) NOT NULL,
      change_reason text NOT NULL,
      changed_by text NOT NULL,
      changed_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (workspace_id, node_id)
        REFERENCES knowledge_nodes(workspace_id, id),
      UNIQUE (node_id, version)
    );

    CREATE TABLE knowledge_edges (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL REFERENCES workspaces(id),
      source_node_id uuid NOT NULL,
      target_node_id uuid NOT NULL,
      type knowledge_edge_type NOT NULL,
      strength numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (strength BETWEEN 0 AND 1),
      confidence numeric(5,4) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
      lifecycle_status knowledge_lifecycle NOT NULL DEFAULT 'PROPOSED',
      provenance jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
      current_version integer NOT NULL DEFAULT 1 CHECK (current_version > 0),
      created_by text NOT NULL,
      updated_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      valid_from timestamptz,
      valid_until timestamptz,
      archived_at timestamptz,
      CHECK (source_node_id <> target_node_id),
      CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
      FOREIGN KEY (workspace_id, source_node_id)
        REFERENCES knowledge_nodes(workspace_id, id),
      FOREIGN KEY (workspace_id, target_node_id)
        REFERENCES knowledge_nodes(workspace_id, id),
      UNIQUE (workspace_id, id)
    );

    CREATE TABLE knowledge_edge_versions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL,
      edge_id uuid NOT NULL,
      version integer NOT NULL CHECK (version > 0),
      source_node_id uuid NOT NULL,
      target_node_id uuid NOT NULL,
      type knowledge_edge_type NOT NULL,
      strength numeric(5,4) NOT NULL,
      confidence numeric(5,4) NOT NULL,
      lifecycle_status knowledge_lifecycle NOT NULL,
      provenance jsonb NOT NULL,
      valid_from timestamptz,
      valid_until timestamptz,
      change_reason text NOT NULL,
      changed_by text NOT NULL,
      changed_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (workspace_id, edge_id)
        REFERENCES knowledge_edges(workspace_id, id),
      UNIQUE (edge_id, version)
    );

    CREATE TABLE knowledge_node_sources (
      workspace_id text NOT NULL,
      node_id uuid NOT NULL,
      source_id uuid NOT NULL,
      supporting_excerpt text NOT NULL CHECK (char_length(supporting_excerpt) BETWEEN 1 AND 4000),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (node_id, source_id, supporting_excerpt),
      FOREIGN KEY (workspace_id, node_id)
        REFERENCES knowledge_nodes(workspace_id, id),
      FOREIGN KEY (workspace_id, source_id)
        REFERENCES knowledge_sources(workspace_id, id)
    );

    CREATE TABLE knowledge_edge_sources (
      workspace_id text NOT NULL,
      edge_id uuid NOT NULL,
      source_id uuid NOT NULL,
      supporting_excerpt text NOT NULL CHECK (char_length(supporting_excerpt) BETWEEN 1 AND 4000),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (edge_id, source_id, supporting_excerpt),
      FOREIGN KEY (workspace_id, edge_id)
        REFERENCES knowledge_edges(workspace_id, id),
      FOREIGN KEY (workspace_id, source_id)
        REFERENCES knowledge_sources(workspace_id, id)
    );

    CREATE TABLE knowledge_node_aliases (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL,
      node_id uuid NOT NULL,
      alias text NOT NULL CHECK (char_length(alias) BETWEEN 1 AND 4000),
      alias_hash character(64) NOT NULL,
      source_node_id uuid,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (workspace_id, node_id)
        REFERENCES knowledge_nodes(workspace_id, id),
      FOREIGN KEY (workspace_id, source_node_id)
        REFERENCES knowledge_nodes(workspace_id, id),
      UNIQUE (workspace_id, node_id, alias_hash)
    );

    CREATE TABLE retrieval_runs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL REFERENCES workspaces(id),
      query text NOT NULL,
      purpose text NOT NULL,
      requesting_system text NOT NULL,
      audience text NOT NULL,
      constraints jsonb NOT NULL,
      scoring_config jsonb NOT NULL,
      embedding_available boolean NOT NULL,
      seed_results jsonb NOT NULL DEFAULT '[]'::jsonb,
      context_pack jsonb,
      estimated_tokens integer,
      created_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, id)
    );

    CREATE TABLE retrieval_run_items (
      retrieval_run_id uuid NOT NULL,
      workspace_id text NOT NULL,
      node_id uuid NOT NULL,
      rank integer NOT NULL CHECK (rank > 0),
      score numeric(9,8) NOT NULL CHECK (score BETWEEN 0 AND 1),
      score_components jsonb NOT NULL,
      seed_node_id uuid,
      path_node_ids uuid[] NOT NULL DEFAULT '{}',
      path_edge_ids uuid[] NOT NULL DEFAULT '{}',
      path_directions text[] NOT NULL DEFAULT '{}',
      path_edge_types knowledge_edge_type[] NOT NULL DEFAULT '{}',
      selected boolean NOT NULL DEFAULT true,
      estimated_tokens integer NOT NULL CHECK (estimated_tokens >= 0),
      why_recalled text NOT NULL,
      PRIMARY KEY (retrieval_run_id, node_id),
      FOREIGN KEY (workspace_id, retrieval_run_id)
        REFERENCES retrieval_runs(workspace_id, id),
      FOREIGN KEY (workspace_id, node_id)
        REFERENCES knowledge_nodes(workspace_id, id),
      FOREIGN KEY (workspace_id, seed_node_id)
        REFERENCES knowledge_nodes(workspace_id, id)
    );

    CREATE TABLE knowledge_usage (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL,
      retrieval_run_id uuid NOT NULL,
      node_id uuid NOT NULL,
      outcome knowledge_usage_outcome NOT NULL,
      reinforcement_delta numeric(6,5) NOT NULL CHECK (reinforcement_delta BETWEEN -0.1 AND 0.1),
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      reported_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (workspace_id, retrieval_run_id)
        REFERENCES retrieval_runs(workspace_id, id),
      FOREIGN KEY (workspace_id, node_id)
        REFERENCES knowledge_nodes(workspace_id, id)
    );

    CREATE TABLE outbox_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL REFERENCES workspaces(id),
      event_type text NOT NULL,
      aggregate_type text NOT NULL,
      aggregate_id uuid NOT NULL,
      payload jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      published_at timestamptz,
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      last_error text
    );

    CREATE OR REPLACE FUNCTION prevent_source_mutation() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'knowledge_sources are immutable; create a new source_version'
        USING ERRCODE = '55000';
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER knowledge_sources_immutable
      BEFORE UPDATE OR DELETE ON knowledge_sources
      FOR EACH ROW EXECUTE FUNCTION prevent_source_mutation();

    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER knowledge_nodes_updated_at
      BEFORE UPDATE ON knowledge_nodes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER knowledge_edges_updated_at
      BEFORE UPDATE ON knowledge_edges
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER workspaces_updated_at
      BEFORE UPDATE ON workspaces
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE INDEX knowledge_sources_workspace_created_idx
      ON knowledge_sources (workspace_id, created_at DESC);
    CREATE INDEX knowledge_extractions_workspace_status_idx
      ON knowledge_extractions (workspace_id, status, created_at DESC);
    CREATE INDEX knowledge_nodes_workspace_lifecycle_idx
      ON knowledge_nodes (workspace_id, lifecycle_status, updated_at DESC);
    CREATE INDEX knowledge_nodes_workspace_verification_idx
      ON knowledge_nodes (workspace_id, verification);
    CREATE INDEX knowledge_nodes_workspace_type_idx
      ON knowledge_nodes (workspace_id, type);
    CREATE INDEX knowledge_nodes_workspace_origin_idx
      ON knowledge_nodes (workspace_id, origin);
    CREATE INDEX knowledge_nodes_workspace_sensitivity_idx
      ON knowledge_nodes (workspace_id, sensitivity);
    CREATE INDEX knowledge_nodes_statement_hash_idx
      ON knowledge_nodes (workspace_id, statement_hash);
    CREATE INDEX knowledge_nodes_search_gin_idx
      ON knowledge_nodes USING gin (search_document);
    CREATE INDEX knowledge_nodes_metadata_gin_idx
      ON knowledge_nodes USING gin (metadata);
    CREATE INDEX knowledge_nodes_embedding_hnsw_idx
      ON knowledge_nodes USING hnsw (embedding vector_cosine_ops)
      WHERE embedding IS NOT NULL;
    CREATE INDEX knowledge_edges_source_idx
      ON knowledge_edges (workspace_id, source_node_id, lifecycle_status);
    CREATE INDEX knowledge_edges_target_idx
      ON knowledge_edges (workspace_id, target_node_id, lifecycle_status);
    CREATE INDEX knowledge_edges_type_idx
      ON knowledge_edges (workspace_id, type, lifecycle_status);
    CREATE INDEX knowledge_node_sources_source_idx
      ON knowledge_node_sources (workspace_id, source_id);
    CREATE INDEX knowledge_edge_sources_source_idx
      ON knowledge_edge_sources (workspace_id, source_id);
    CREATE INDEX retrieval_runs_workspace_created_idx
      ON retrieval_runs (workspace_id, created_at DESC);
    CREATE INDEX knowledge_usage_node_idx
      ON knowledge_usage (workspace_id, node_id, created_at DESC);
    CREATE INDEX outbox_unpublished_idx
      ON outbox_events (created_at) WHERE published_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS outbox_events;
    DROP TABLE IF EXISTS knowledge_usage;
    DROP TABLE IF EXISTS retrieval_run_items;
    DROP TABLE IF EXISTS retrieval_runs;
    DROP TABLE IF EXISTS knowledge_node_aliases;
    DROP TABLE IF EXISTS knowledge_edge_sources;
    DROP TABLE IF EXISTS knowledge_node_sources;
    DROP TABLE IF EXISTS knowledge_edge_versions;
    DROP TABLE IF EXISTS knowledge_edges;
    DROP TABLE IF EXISTS knowledge_node_versions;
    DROP TABLE IF EXISTS knowledge_nodes;
    DROP TABLE IF EXISTS knowledge_extractions;
    DROP TABLE IF EXISTS knowledge_sources;
    DROP TABLE IF EXISTS workspaces;
    DROP FUNCTION IF EXISTS set_updated_at();
    DROP FUNCTION IF EXISTS prevent_source_mutation();
    DROP TYPE IF EXISTS knowledge_usage_outcome;
    DROP TYPE IF EXISTS knowledge_extraction_status;
    DROP TYPE IF EXISTS knowledge_sensitivity;
    DROP TYPE IF EXISTS knowledge_lifecycle;
    DROP TYPE IF EXISTS knowledge_verification;
    DROP TYPE IF EXISTS knowledge_origin;
    DROP TYPE IF EXISTS knowledge_edge_type;
    DROP TYPE IF EXISTS knowledge_node_type;
  `);
};
