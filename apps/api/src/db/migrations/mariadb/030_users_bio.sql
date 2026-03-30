-- Migration 030: Add bio field to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT NULL DEFAULT NULL AFTER name;
