-- Optional gallery pre-assignment for invitations.
-- When set, acceptInvitation() automatically adds the new user to that gallery.
ALTER TABLE invitations ADD COLUMN gallery_id   TEXT REFERENCES galleries(id) ON DELETE SET NULL;
ALTER TABLE invitations ADD COLUMN gallery_role TEXT CHECK(gallery_role IN ('viewer','contributor','editor'));
