-- Copyright (c) 2026 Philippe Vollenweider
-- This file is part of the GalleryPack commercial platform.
-- Proprietary and confidential. All rights reserved.

-- Migration 016: FK constraints and NOT NULL on organization_id
-- Tables where every row must have an org (backfill is complete):

ALTER TABLE projects          MODIFY COLUMN organization_id VARCHAR(36) NOT NULL;
ALTER TABLE galleries         MODIFY COLUMN organization_id VARCHAR(36) NOT NULL;
ALTER TABLE studio_memberships MODIFY COLUMN organization_id VARCHAR(36) NOT NULL;
ALTER TABLE studio_domains    MODIFY COLUMN organization_id VARCHAR(36) NOT NULL;
ALTER TABLE invitations        MODIFY COLUMN organization_id VARCHAR(36) NOT NULL;
ALTER TABLE build_jobs         MODIFY COLUMN organization_id VARCHAR(36) NOT NULL;

-- users.organization_id stays nullable (users can exist without a studio)
-- email_log.organization_id stays nullable (legacy rows may have no studio)
-- settings.organization_id stays nullable (PK already covers it)
-- invites.organization_id stays nullable (non-studio scoped invites)

-- Foreign keys
ALTER TABLE projects           ADD CONSTRAINT fk_projects_org      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE galleries          ADD CONSTRAINT fk_galleries_org     FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE studio_memberships ADD CONSTRAINT fk_memberships_org   FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE studio_domains     ADD CONSTRAINT fk_domains_org       FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE invitations        ADD CONSTRAINT fk_invitations_org   FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE build_jobs         ADD CONSTRAINT fk_jobs_org          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Indexes for query performance
CREATE INDEX idx_projects_org       ON projects(organization_id);
CREATE INDEX idx_galleries_org      ON galleries(organization_id);
CREATE INDEX idx_memberships_org    ON studio_memberships(organization_id);
CREATE INDEX idx_build_jobs_org     ON build_jobs(organization_id);
CREATE INDEX idx_domains_org        ON studio_domains(organization_id);
