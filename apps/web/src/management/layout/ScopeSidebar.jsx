// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/I18nContext.jsx';
import { api } from '../../lib/api.js';
import { useUpload } from '../context/UploadContext.jsx';

// ── Tree primitives ────────────────────────────────────────────────────────────

const pad = (depth) => ({ paddingLeft: 16 + depth * 13 });

function TreeLink({ to, label, depth = 0, end = false, onClick, icon, bold = false }) {
  return (
    <li className="nav-item">
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        style={{
          ...pad(depth), minHeight: 36, fontSize: '0.84rem',
          display: 'flex', alignItems: 'center',
          fontWeight: bold ? 600 : 400,
        }}
        onClick={onClick}
      >
        {icon && (
          <i className={`nav-icon ${icon}`}
            style={{ marginRight: 6, fontSize: '0.78rem', opacity: 0.7, width: 14, flexShrink: 0 }} />
        )}
        <p style={{ margin: 0, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </p>
      </NavLink>
    </li>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export default function ScopeSidebar({ scope, params = {}, isMobileDrawer = false, onClose }) {
  const { user, logout } = useAuth();
  const t = useT();
  const isSuperadmin  = user?.platformRole === 'superadmin';
  const canManageOrg  = ['admin', 'owner'].includes(user?.organizationRole) || isSuperadmin;
  const { globalStats } = useUpload();
  const uploadTotal  = globalStats.uploading + globalStats.queued;
  const uploadActive = uploadTotal > 0;
  const uploadHue    = Math.round(210 - Math.min(1, uploadTotal / 30) * 210);
  const uploadColor  = `hsl(${uploadHue}, 75%, 62%)`;

  // Build activity polling
  const [activeJobs, setActiveJobs] = useState([]);
  const buildPollRef = useRef(null);
  const pollBuilds = useCallback(() => {
    api.listActiveJobs().then(jobs => {
      setActiveJobs(jobs);
      clearTimeout(buildPollRef.current);
      buildPollRef.current = setTimeout(pollBuilds, jobs.length > 0 ? 4000 : 30000);
    }).catch(() => {
      clearTimeout(buildPollRef.current);
      buildPollRef.current = setTimeout(pollBuilds, 30000);
    });
  }, []);
  useEffect(() => { pollBuilds(); return () => clearTimeout(buildPollRef.current); }, [pollBuilds]);

  // Entity names loaded by the sidebar when params change
  const [orgName,     setOrgName]     = useState('…');
  const [projectName, setProjectName] = useState('…');
  const [galleryName, setGalleryName] = useState('…');

  useEffect(() => {
    if (!params.orgId) return;
    setOrgName('…');
    api.getOrganization(params.orgId)
      .then(o => setOrgName(o.name || o.slug))
      .catch(() => setOrgName(params.orgId.slice(0, 10)));
  }, [params.orgId]);

  useEffect(() => {
    if (!params.projectId) return;
    setProjectName('…');
    api.getProject(params.projectId)
      .then(p => setProjectName(p.name || p.slug))
      .catch(() => setProjectName(params.projectId.slice(0, 10)));
  }, [params.projectId]);

  useEffect(() => {
    if (!params.galleryId) return;
    setGalleryName('…');
    api.getGallery(params.galleryId)
      .then(g => setGalleryName(g.title || g.slug))
      .catch(() => setGalleryName(params.galleryId.slice(0, 10)));
  }, [params.galleryId]);

  const { orgId, projectId, galleryId } = params;
  const click    = isMobileDrawer && onClose ? onClose : undefined;
  const orgBase  = orgId     ? `/admin/organizations/${orgId}` : '';
  const projBase = projectId ? `${orgBase}/projects/${projectId}` : '';
  const galBase  = galleryId ? `${projBase}/galleries/${galleryId}` : '';

  const hasOrg     = scope === 'organization' || scope === 'project' || scope === 'gallery';
  const hasProject = scope === 'project' || scope === 'gallery';
  const hasGallery = scope === 'gallery';

  return (
    <aside className="app-sidebar bg-body" data-bs-theme="dark">
      {/* Brand */}
      <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/admin/organizations" className="brand-link" onClick={click}>
          <span className="brand-text fw-bold" style={{ fontSize: '1rem', letterSpacing: '-0.02em' }}>
            {t('manage_title')}
          </span>
        </Link>
        {isMobileDrawer && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            style={{
              background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)',
              minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
            }}
          >
            <i className="fas fa-times" />
          </button>
        )}
      </div>

      <div className="sidebar-wrapper">
        {/* User panel */}
        <div className="d-flex align-items-center px-3 py-3 border-bottom border-secondary">
          <span
            className="d-flex align-items-center justify-content-center fw-bold text-white me-2"
            style={{ width: 34, height: 34, background: '#6c757d', fontSize: '0.9rem', borderRadius: '50%', flexShrink: 0 }}
            aria-hidden="true"
          >
            {(user?.name || user?.email || '?')[0].toUpperCase()}
          </span>
          <div className="flex-grow-1 overflow-hidden">
            <div className="text-white text-truncate" style={{ fontSize: '0.85rem' }}>
              {user?.name || user?.email}
            </div>
            <NavLink to="/admin/profile" className="text-muted" style={{ fontSize: '0.75rem' }} onClick={click}>
              <i className="fas fa-user-cog me-1" />{t('profile_title')}
            </NavLink>
          </div>
        </div>

        {/* Navigation tree */}
        <nav className="mt-2" aria-label="Main navigation">
          <ul className="nav sidebar-menu flex-column">

            {/* Root: Organizations */}
            <TreeLink
              to="/admin/organizations"
              label={t('nav_organizations')}
              icon="fas fa-building"
              depth={0}
              end={!scope || scope === 'platform'}
              onClick={click}
            />

            {/* Org context */}
            {hasOrg && orgId && (
              <>
                <TreeLink to={orgBase} label={orgName} depth={1} end onClick={click} bold />
                {canManageOrg && <TreeLink to={`${orgBase}/settings`} label={t('nav_settings')} depth={2} onClick={click} />}

                {/* Project context */}
                {hasProject && projectId && (
                  <>
                    <TreeLink to={orgBase} label={t('nav_projects')} depth={2} end onClick={click} />
                    <TreeLink to={projBase} label={projectName} depth={3} end onClick={click} bold />

                    {/* Gallery context */}
                    {hasGallery && galleryId && (
                      <>
                        <TreeLink to={projBase} label={t('nav_galleries')} depth={4} end onClick={click} />
                        <TreeLink to={`${galBase}/photos`} label={galleryName} depth={5} bold onClick={click} />
                        <TreeLink to={`${galBase}/settings`}   label={t('nav_settings')}   depth={6} onClick={click} />
                        <TreeLink to={`${galBase}/jobs`}       label={t('tab_jobs')}       depth={6} onClick={click} />
                        <TreeLink to={`${galBase}/statistics`} label={t('nav_statistics')} depth={6} onClick={click} />
                      </>
                    )}

                    <TreeLink to={`${projBase}/settings`} label={t('nav_settings')} depth={4} onClick={click} />
                  </>
                )}

                {canManageOrg && <TreeLink to={`${orgBase}/team`} label={t('nav_team')} depth={2} onClick={click} />}
                {canManageOrg && <TreeLink to={`${orgBase}/insights`} label={t('tab_insights')} depth={2} onClick={click} />}
              </>
            )}
          </ul>
        </nav>

        {/* Build activity indicator */}
        {activeJobs.length > 0 && (
          <div style={{ padding: '0.5rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <i className="fas fa-cog fa-spin" style={{ color: '#60aaff', fontSize: '0.72rem', flexShrink: 0 }} />
              <span style={{ fontSize: '0.74rem', color: '#60aaff', fontWeight: 500 }}>
                {activeJobs.length === 1
                  ? (activeJobs[0].status === 'running' ? t('build_running') : t('build_queued'))
                  : `${activeJobs.length} ${t('builds_active')}`}
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                background: 'linear-gradient(90deg, #60aaff, #3d8bff)',
                width: activeJobs.some(j => j.status === 'running') ? '60%' : '20%',
                transition: 'width 0.6s ease',
              }} />
            </div>
          </div>
        )}

        {/* Upload activity indicator */}
        {uploadActive && (
          <div style={{ padding: '0.5rem 1.25rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
              <i className="fas fa-spinner fa-spin" style={{ color: uploadColor, fontSize: '0.72rem', flexShrink: 0 }} />
              <span style={{ fontSize: '0.74rem', color: uploadColor, fontWeight: 500 }}>
                {uploadTotal} photo{uploadTotal > 1 ? 's' : ''}
                {globalStats.uploading > 0 ? ` · ${globalStats.uploading} actif${globalStats.uploading > 1 ? 's' : ''}` : ''}
              </span>
            </div>
            <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99, background: uploadColor,
                width: `${Math.min(100, (uploadTotal / 30) * 100)}%`,
                transition: 'width 0.4s ease, background 0.6s ease',
              }} />
            </div>
          </div>
        )}

        {/* Bottom: Platform + Inspector (superadmin only) + Sign out */}
        <nav className="mt-2 border-top border-secondary pt-2" aria-label="Platform tools">
          <ul className="nav sidebar-menu flex-column">
            {isSuperadmin && (
              <>
                <TreeLink to="/admin/platform" label={t('nav_platform')} icon="fas fa-server"  depth={0} end onClick={click} />
                {scope === 'platform' && (
                  <>
                    <TreeLink to="/admin/platform/branding" label={t('nav_branding')} depth={1} onClick={click} />
                    <TreeLink to="/admin/platform/license"  label={t('nav_license')}  depth={1} onClick={click} />
                    <TreeLink to="/admin/platform/smtp"     label={t('nav_smtp')}     depth={1} onClick={click} />
                    <TreeLink to="/admin/platform/team"     label={t('nav_team')}     depth={1} onClick={click} />
                  </>
                )}
                <TreeLink to="/inspector"      label={t('nav_inspector')} icon="fas fa-search" depth={0} onClick={click} />
              </>
            )}
            <li className="nav-item">
              <button
                type="button"
                className="nav-link w-100 text-start"
                onClick={logout}
                style={{ background: 'none', border: 'none', minHeight: 44, ...pad(0) }}
              >
                <i className="nav-icon fas fa-sign-out-alt" />
                <p>{t('sign_out')}</p>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    </aside>
  );
}
