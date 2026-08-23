CREATE TABLE IF NOT EXISTS wdw_public_snapshots (
  snapshot_id TEXT PRIMARY KEY CHECK (snapshot_id ~ '^sha256:[0-9a-f]{64}$'),
  schema_name TEXT NOT NULL CHECK (schema_name = 'wdw.public-snapshot.v1'),
  generated_at TIMESTAMPTZ NOT NULL,
  eligible_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL CHECK (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  envelope JSONB NOT NULL CHECK (jsonb_typeof(envelope) = 'object'),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (eligible_at = generated_at + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS wdw_public_snapshots_latest_eligible
  ON wdw_public_snapshots (eligible_at, generated_at DESC)
  WHERE verified = TRUE;

CREATE OR REPLACE FUNCTION reject_wdw_public_snapshot_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wdw_public_snapshots is append-only';
END;
$$;

DROP TRIGGER IF EXISTS wdw_public_snapshots_immutable ON wdw_public_snapshots;
CREATE TRIGGER wdw_public_snapshots_immutable
  BEFORE UPDATE OR DELETE ON wdw_public_snapshots
  FOR EACH ROW EXECUTE FUNCTION reject_wdw_public_snapshot_mutation();
