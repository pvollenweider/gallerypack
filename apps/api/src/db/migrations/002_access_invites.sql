-- 002_access_invites.sql — gallery password hashes + invite revocation + single-use

-- Add bcrypt-style password hash to galleries (replaces plain `password` field for viewer access)
ALTER TABLE galleries ADD COLUMN password_hash TEXT;

-- Add revocation + single-use support to invites
ALTER TABLE invites ADD COLUMN revoked_at  INTEGER;    -- NULL = active
ALTER TABLE invites ADD COLUMN single_use  INTEGER NOT NULL DEFAULT 0;  -- 1 = invalidate after first use
