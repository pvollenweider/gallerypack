// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth.jsx';
import { useT } from '../../lib/I18nContext.jsx';
import { api } from '../../lib/api.js';
import { globalNav, scopeNav, scopeLabels } from '../navigation/nav.config.js';
import { interpolatePath } from '../navigation/nav.helpers.js';

/**
 * Sidebar driven entirely by nav.config.
 * Props:
 *   isMobileDrawer  — when true, renders in the mobile drawer context
 *   onClose         — called to close the mobile drawer (link clicks also close it)
 */
export default function ScopeSidebar({ scope, params = {}, isMobileDrawer = false, onClose }) {
  const { user, setUser, logout } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const isSuperadmin = user?.platformRole === 'superadmin';
  const canAdmin = ['admin', 'owner', 'collaborator'].includes(user?.studioRole) || isSuperadmin;

  // Org switcher (superadmin only)
  const [studios,   setStudios]   = useState([]);
  const [orgOpen,   setOrgOpen]   = useState(false);
  const [switching, setSwitching] = useState(false);
  const orgRef = useRef(null);

  useEffect(() => {
    if (isSuperadmin) api.listPlatformStudios().then(setStudios).catch(() => {});
  }, [isSuperadmin]);

  useEffect(() => {
    function onOutside(e) {
      if (orgRef.current && !orgRef.current.contains(e.target)) setOrgOpen(false);
    }
    if (orgOpen) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [orgOpen]);

  async function handleSwitchOrg(studioId) {
    if (studioId === user?.studioId) { setOrgOpen(false); return; }
    setSwitching(true);
    try {
      await api.switchStudio(studioId);
      const me = await api.me();
      setUser(me);
      navigate('/admin');
    } catch {}
    finally { setSwitching(false); setOrgOpen(false); }
  }

  const navCls = ({ isActive }) => `nav-link${isActive ? ' active' : ''}`;
  const contextItems = scope ? scopeNav[scope] : null;
  const otherStudios = studios.filter(s => s.id !== user?.studioId);
  const canSwitch = isSuperadmin && otherStudios.length > 0;

  // On mobile drawer, clicking a nav item should close it
  const handleNavClick = isMobileDrawer && onClose ? onClose : undefined;

  return (
    <aside className="app-sidebar bg-body" data-bs-theme="dark">
      <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to="/admin" className="brand-link" onClick={handleNavClick}>
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
            <NavLink to="/admin/profile" className="text-muted" style={{ fontSize: '0.75rem' }} onClick={handleNavClick}>
              <i className="fas fa-user-cog me-1" />{t('profile_title')}
            </NavLink>
          </div>
        </div>

        {/* Current organization + switcher (superadmin) */}
        <div className="border-bottom border-secondary" ref={orgRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className={`nav-link w-100 text-start d-flex align-items-center${orgOpen ? ' active' : ''}`}
            onClick={() => canSwitch && setOrgOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: canSwitch ? 'pointer' : 'default', padding: '0.55rem 1.25rem', minHeight: 44 }}
            disabled={switching}
          >
            <i className="nav-icon fas fa-building" />
            <p className="mb-0 flex-grow-1">
              {switching ? '…' : (user?.studioName || t('studio_untitled'))}
            </p>
            {canSwitch && (
              <i className={`fas fa-angle-${orgOpen ? 'up' : 'down'} ms-1`}
                style={{ fontSize: '0.7rem', opacity: 0.5 }} />
            )}
          </button>

          {orgOpen && (
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '100%',
              background: '#2d3238', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '0 0 4px 4px', zIndex: 1050,
              maxHeight: 220, overflowY: 'auto',
            }}>
              {otherStudios.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSwitchOrg(s.id)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '0.5rem 1.25rem', background: 'none', border: 'none',
                    color: 'rgba(255,255,255,0.65)', fontSize: '0.82rem', cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  <i className="fas fa-building me-2" style={{ opacity: 0.4 }} />{s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Global navigation */}
        <nav className="mt-2" aria-label="Main navigation">
          <ul className="nav sidebar-menu flex-column">
            {globalNav
              .filter(item => !item.superadminOnly || isSuperadmin)
              .map(item => (
                <li key={item.key} className="nav-item">
                  <NavLink to={item.href} end={item.href === '/admin'} className={navCls} onClick={handleNavClick}
                    style={{ minHeight: 44 }}>
                    <i className={`nav-icon ${item.icon}`} />
                    <p>{item.label}</p>
                  </NavLink>
                </li>
              ))}
          </ul>
        </nav>

        {/* Contextual scope navigation */}
        {contextItems && (
          <>
            <div className="px-3 py-2 border-top border-secondary mt-2">
              <span className="text-white" style={{ fontSize: '0.72rem', opacity: 0.5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {scopeLabels[scope]}
              </span>
            </div>
            <nav aria-label={`${scopeLabels[scope]} navigation`}>
              <ul className="nav sidebar-menu flex-column">
                {contextItems.map(item => {
                  const href = interpolatePath(item.href, params);
                  return (
                    <li key={item.key} className="nav-item">
                      <NavLink
                        to={href}
                        end={item.key === 'overview'}
                        className={navCls}
                        onClick={handleNavClick}
                        style={{ minHeight: 44 }}
                      >
                        <i className={`nav-icon ${item.icon}`} />
                        <p>{item.label}</p>
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </>
        )}

        {/* Tools — Inspector (admin+) + logout */}
        <nav className="mt-2 border-top border-secondary pt-2" aria-label="Tools">
          <ul className="nav sidebar-menu flex-column">
            {canAdmin && (
              <li className="nav-item">
                <NavLink to="/inspector" className={navCls} onClick={handleNavClick} style={{ minHeight: 44 }}>
                  <i className="nav-icon fas fa-search" />
                  <p>{t('nav_inspector')}</p>
                </NavLink>
              </li>
            )}
            <li className="nav-item">
              <button
                type="button"
                className="nav-link w-100 text-start"
                onClick={logout}
                style={{ background: 'none', border: 'none', minHeight: 44 }}
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
