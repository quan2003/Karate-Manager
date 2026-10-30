-- Keeps a verifiable private-media reservation for future K-SPORT web
-- registrations. It does not read, alter, or backfill historical data.
CREATE TABLE IF NOT EXISTS public_registration_media (
  athlete_id TEXT PRIMARY KEY,
  tournament_id VARCHAR(255) NOT NULL,
  club_id TEXT NOT NULL,
  owner_license_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_registration_media_tournament
  ON public_registration_media (tournament_id);
