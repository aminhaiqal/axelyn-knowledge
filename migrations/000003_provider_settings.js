exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE provider_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id text NOT NULL UNIQUE REFERENCES workspaces(id),
      provider text NOT NULL DEFAULT 'openrouter' CHECK (provider = 'openrouter'),
      encrypted_api_key text NOT NULL,
      key_hint text NOT NULL CHECK (char_length(key_hint) BETWEEN 4 AND 32),
      key_label text,
      models jsonb NOT NULL CHECK (
        jsonb_typeof(models) = 'array' AND jsonb_array_length(models) BETWEEN 1 AND 5
      ),
      credential_status text NOT NULL DEFAULT 'VALID'
        CHECK (credential_status IN ('VALID', 'INVALID')),
      is_free_tier boolean,
      limit_remaining numeric(14,4),
      expires_at timestamptz,
      validated_at timestamptz NOT NULL DEFAULT now(),
      created_by text NOT NULL,
      updated_by text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TRIGGER provider_settings_updated_at
      BEFORE UPDATE ON provider_settings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS provider_settings_updated_at ON provider_settings;
    DROP TABLE IF EXISTS provider_settings;
  `);
};
