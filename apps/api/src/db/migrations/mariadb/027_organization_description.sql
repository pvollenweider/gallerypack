-- Migration 027: add description column to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS description TEXT NULL
  AFTER name;
