-- Migration 004: add site_title to settings
ALTER TABLE settings ADD COLUMN site_title TEXT;
