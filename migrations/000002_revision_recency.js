exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_knowledge_node_updated_at() RETURNS trigger AS $$
    BEGIN
      IF NEW.current_version IS DISTINCT FROM OLD.current_version THEN
        NEW.updated_at = now();
      ELSE
        NEW.updated_at = OLD.updated_at;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    DROP TRIGGER knowledge_nodes_updated_at ON knowledge_nodes;
    CREATE TRIGGER knowledge_nodes_updated_at
      BEFORE UPDATE ON knowledge_nodes
      FOR EACH ROW EXECUTE FUNCTION set_knowledge_node_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER knowledge_nodes_updated_at ON knowledge_nodes;
    DROP FUNCTION IF EXISTS set_knowledge_node_updated_at();
    CREATE TRIGGER knowledge_nodes_updated_at
      BEFORE UPDATE ON knowledge_nodes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};
