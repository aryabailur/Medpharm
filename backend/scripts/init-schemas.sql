-- MedTrack — schema bootstrap
--
-- ONE Postgres instance, TWO logically isolated schemas.
-- Each app owns its own schema and its own Prisma client.
--
-- Hard rule (ARCHITECTURE.md 3.1): NO FOREIGN KEYS ACROSS THE BOUNDARY.
-- All cross-app data movement goes over the signed HTTP contract in 5.
-- This is what lets us truthfully tell judges the two apps share no tables.

CREATE SCHEMA IF NOT EXISTS vayu;
CREATE SCHEMA IF NOT EXISTS dhanvantari;

-- uuid_generate_v7() is not built in yet; apps generate UUIDv7 in
-- application code (ARCHITECTURE.md 4.1). pgcrypto is here for gen_random_uuid()
-- as a fallback and for any digest work.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
