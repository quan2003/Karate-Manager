-- Rollback only removes new media metadata. It does not delete R2 objects.
DROP TABLE IF EXISTS athlete_media;
