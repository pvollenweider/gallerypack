-- Migration 026: add name column to invitations
-- Lets admins pre-set the display name of an invited user.
ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS name VARCHAR(255) NOT NULL DEFAULT ''
  AFTER email;
