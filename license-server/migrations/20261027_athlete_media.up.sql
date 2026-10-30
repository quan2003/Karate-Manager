-- Additive migration: does not read or change any historical tournament data.
CREATE TABLE IF NOT EXISTS athlete_media (
  athlete_id TEXT PRIMARY KEY,
  owner_license_id UUID NOT NULL,
  public_athlete_id VARCHAR(64) UNIQUE NOT NULL,
  object_key TEXT NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_athlete_media_public
  ON athlete_media (public_athlete_id) WHERE is_public = TRUE;
