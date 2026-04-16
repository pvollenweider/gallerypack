// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert, AdminInput, AdminSwitch } from '../../../components/ui/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b) {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function timeAgo(iso) {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "à l'instant";
  if (diff < 3600)  return `il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
  return `il y a ${Math.floor(diff / 86400)} j`;
}

const STATE_VARIANT = {
  success: 'success',
  running: 'primary',
  error:   'danger',
  pending: 'warning',
};

const STATE_ICON = {
  success: 'fas fa-check-circle',
  running: 'fas fa-spinner fa-spin',
  error:   'fas fa-times-circle',
  pending: 'fas fa-clock',
};

const STATE_COLOR = {
  success: 'var(--bs-success)',
  running: 'var(--bs-primary)',
  error:   'var(--bs-danger)',
  pending: 'var(--bs-warning)',
};

// ── Disk usage bar ────────────────────────────────────────────────────────────

function DiskBar({ label, bytes, total, colorClass }) {
  const pct = total > 0 && bytes != null ? Math.round((bytes / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="d-flex justify-content-between mb-1" style={{ fontSize: '0.82rem' }}>
        <span className="text-body">{label}</span>
        <span className="text-muted">{fmtBytes(bytes)} ({pct}%)</span>
      </div>
      <div className="progress" style={{ height: 6 }}>
        <div
          className={`progress-bar bg-${colorClass}`}
          style={{ width: `${pct}%`, transition: 'width 0.4s' }}
        />
      </div>
    </div>
  );
}

// ── Row helper ────────────────────────────────────────────────────────────────

function Row({ label, value }) {
  return (
    <div className="d-flex gap-2 mb-1" style={{ fontSize: '0.82rem' }}>
      <span className="text-muted" style={{ minWidth: 90, flexShrink: 0 }}>{label}</span>
      <span className="text-body">{value}</span>
    </div>
  );
}

const CFG_DEFAULTS = {
  remote: 'dropbox',
  remotePath: 'gallerypack',
  syncPrivate: true,
  syncPublic: true,
  syncInternal: true,
  dbRetentionDays: 7,
  bwlimit: '0',
};

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BackupPage() {
  const t = useT();
  const [status, setStatus]   = useState(null);
  const [logs, setLogs]       = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [error, setError]     = useState('');
  const logRef = useRef(null);

  // Config form
  const [cfg, setCfg]               = useState(CFG_DEFAULTS);
  const [cfgSaving, setCfgSaving]   = useState(false);
  const [cfgSaved, setCfgSaved]     = useState('');
  const [cfgError, setCfgError]     = useState('');

  // rclone.conf setup
  const [rcloneToken, setRcloneToken]       = useState('');
  const [rcloneSaving, setRcloneSaving]     = useState(false);
  const [rcloneSaved, setRcloneSaved]       = useState('');
  const [rcloneError, setRcloneError]       = useState('');
  const [rcloneConfigured, setRcloneConfigured] = useState(false);

  const syncState = status?.triggerPending
    ? 'pending'
    : status?.lastSync?.state ?? null;

  const isActive = syncState === 'running' || syncState === 'pending';

  const loadAll = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        api.inspectorBackupStatus(),
        api.inspectorBackupLogs(150),
      ]);
      setStatus(s);
      setLogs(l.log);
    } catch {}
  }, []);

  // Load config once on mount
  useEffect(() => {
    api.inspectorBackupConfig().then(c => {
      setCfg({ ...CFG_DEFAULTS, ...c });
      setRcloneConfigured(!!c.rcloneConfigured);
    }).catch(() => {});
  }, []);

  async function saveConfig(e) {
    e.preventDefault();
    setCfgSaving(true); setCfgSaved(''); setCfgError('');
    try {
      const saved = await api.inspectorBackupSaveConfig(cfg);
      setCfg({ ...CFG_DEFAULTS, ...saved });
      setCfgSaved(t('settings_saved'));
    } catch (err) {
      setCfgError(err.message || 'Save failed');
    } finally {
      setCfgSaving(false);
    }
  }

  function setCfgField(field) {
    return e => setCfg(c => ({ ...c, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  }

  async function saveRclone(e) {
    e.preventDefault();
    setRcloneSaving(true); setRcloneSaved(''); setRcloneError('');
    try {
      await api.inspectorBackupSaveRclone(cfg.remote, rcloneToken.trim());
      setRcloneConfigured(true);
      setRcloneToken('');
      setRcloneSaved(t('backup_rclone_saved'));
    } catch (err) {
      setRcloneError(err.message || 'Save failed');
    } finally {
      setRcloneSaving(false);
    }
  }

  // Poll fast when active, slow when idle
  useEffect(() => {
    loadAll();
    const ms = isActive ? 5000 : 30000;
    const timer = setInterval(loadAll, ms);
    return () => clearInterval(timer);
  }, [loadAll, isActive]);

  // Auto-scroll log when active
  useEffect(() => {
    if (isActive && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs, isActive]);

  async function triggerSync(dbOnly = false) {
    setSyncing(true); setError(''); setSyncMsg('');
    try {
      await api.inspectorBackupSync(dbOnly);
      setSyncMsg('Sync demandé — démarrage dans les 5 prochaines minutes.');
      await loadAll();
    } catch (e) {
      setError(e.message || 'Erreur lors du déclenchement');
    } finally {
      setSyncing(false);
    }
  }

  const du = status?.diskUsage ?? {};
  const totalBytes = (du.private ?? 0) + (du.public ?? 0) + (du.internal ?? 0);
  const lastSync = status?.lastSync;

  return (
    <AdminPage
      title={t('inspector_backup_title')}
      maxWidth="1200px"
      actions={
        <>
          <AdminButton
            variant="outline-secondary"
            size="sm"
            icon="fas fa-database"
            onClick={() => triggerSync(true)}
            disabled={syncing || isActive}
          >
            {t('inspector_backup_db_only')}
          </AdminButton>
          <AdminButton
            size="sm"
            icon={syncing ? 'fas fa-spinner fa-spin' : 'fas fa-sync-alt'}
            onClick={() => triggerSync(false)}
            disabled={syncing || isActive}
            loading={syncing}
            loadingLabel={t('inspector_backup_syncing')}
          >
            {t('inspector_backup_sync_now')}
          </AdminButton>
        </>
      }
    >
      <AdminAlert variant="success" message={syncMsg} />
      <AdminAlert message={error} />

      {/* ── Configuration ── */}
      <form onSubmit={saveConfig}>
        <AdminCard title={t('backup_config_title')} className="mb-3">
          <div className="row">
            <div className="col-md-6">
              <p className="text-muted mb-3" style={{ fontSize: '0.82rem' }}>
                {t('backup_config_hint')}
              </p>
              <div className="row">
                <div className="col-sm-5">
                  <AdminInput
                    label={t('backup_config_remote')}
                    value={cfg.remote}
                    onChange={setCfgField('remote')}
                    placeholder="dropbox"
                    hint={t('backup_config_remote_hint')}
                  />
                </div>
                <div className="col-sm-7">
                  <AdminInput
                    label={t('backup_config_remote_path')}
                    value={cfg.remotePath}
                    onChange={setCfgField('remotePath')}
                    placeholder="gallerypack"
                    hint={t('backup_config_remote_path_hint')}
                  />
                </div>
              </div>
              <div className="row">
                <div className="col-sm-5">
                  <AdminInput
                    label={t('backup_config_bwlimit')}
                    value={cfg.bwlimit}
                    onChange={setCfgField('bwlimit')}
                    placeholder="0"
                    hint={t('backup_config_bwlimit_hint')}
                  />
                </div>
                <div className="col-sm-7">
                  <AdminInput
                    label={t('backup_config_db_retention')}
                    type="number"
                    value={cfg.dbRetentionDays}
                    onChange={setCfgField('dbRetentionDays')}
                    hint={t('backup_config_db_retention_hint')}
                  />
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <p className="text-muted mb-2" style={{ fontSize: '0.82rem' }}>{t('backup_config_dirs')}</p>
              <AdminSwitch
                id="cfg-sync-private"
                label={<><code>private/</code> <span className="text-muted ms-1" style={{ fontSize: '0.78rem' }}>{t('backup_config_dir_private')}</span></>}
                checked={cfg.syncPrivate}
                onChange={setCfgField('syncPrivate')}
              />
              <AdminSwitch
                id="cfg-sync-public"
                label={<><code>public/</code> <span className="text-muted ms-1" style={{ fontSize: '0.78rem' }}>{t('backup_config_dir_public')}</span></>}
                checked={cfg.syncPublic}
                onChange={setCfgField('syncPublic')}
              />
              <AdminSwitch
                id="cfg-sync-internal"
                label={<><code>internal/</code> <span className="text-muted ms-1" style={{ fontSize: '0.78rem' }}>{t('backup_config_dir_internal')}</span></>}
                checked={cfg.syncInternal}
                onChange={setCfgField('syncInternal')}
              />
              <div className="mt-3 p-2 rounded" style={{ background: 'var(--bs-light)', fontSize: '0.78rem' }}>
                <i className="fas fa-info-circle me-1 text-muted" />
                {t('backup_config_rclone_hint')}
              </div>
            </div>
          </div>
          <AdminAlert variant="success" message={cfgSaved} />
          <AdminAlert message={cfgError} />
          <AdminButton type="submit" loading={cfgSaving} loadingLabel={t('saving')} icon="fas fa-save">
            {t('save')}
          </AdminButton>
        </AdminCard>
      </form>

      {/* ── Dropbox authentication ── */}
      <form onSubmit={saveRclone}>
        <AdminCard
          title={t('backup_rclone_title')}
          headerRight={
            rcloneConfigured
              ? <span className="badge bg-success"><i className="fas fa-check me-1" />{t('backup_rclone_ok')}</span>
              : <span className="badge bg-warning text-dark"><i className="fas fa-exclamation-triangle me-1" />{t('backup_rclone_missing')}</span>
          }
          className="mb-3"
        >
          <div className="row">
            <div className="col-md-6">
              <p className="text-muted mb-2" style={{ fontSize: '0.82rem' }}>{t('backup_rclone_hint')}</p>
              <ol className="ps-3 mb-3" style={{ fontSize: '0.82rem' }}>
                <li>{t('backup_rclone_step1')}<br /><code style={{ fontSize: '0.8rem' }}>rclone authorize &quot;dropbox&quot;</code></li>
                <li className="mt-1">{t('backup_rclone_step2')}</li>
                <li className="mt-1">{t('backup_rclone_step3')}</li>
              </ol>
              <div className="mb-3">
                <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 500 }}>{t('backup_rclone_token_label')}</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={4}
                  style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem', resize: 'vertical' }}
                  placeholder={'{"access_token":"...","token_type":"bearer","refresh_token":"...","expiry":"..."}'}
                  value={rcloneToken}
                  onChange={e => setRcloneToken(e.target.value)}
                  spellCheck={false}
                />
                <div className="form-text">{t('backup_rclone_token_hint', { remote: cfg.remote })}</div>
              </div>
              <AdminAlert variant="success" message={rcloneSaved} />
              <AdminAlert message={rcloneError} />
              <AdminButton
                type="submit"
                loading={rcloneSaving}
                loadingLabel={t('saving')}
                icon="fas fa-key"
                disabled={!rcloneToken.trim()}
              >
                {t('backup_rclone_save')}
              </AdminButton>
            </div>
            <div className="col-md-6">
              <div className="p-3 rounded" style={{ background: 'var(--bs-light)', fontSize: '0.8rem' }}>
                <p className="fw-semibold mb-2"><i className="fas fa-terminal me-1" />{t('backup_rclone_install')}</p>
                <p className="text-muted mb-1">{t('backup_rclone_install_mac')}</p>
                <code style={{ fontSize: '0.75rem' }}>brew install rclone</code>
                <p className="text-muted mt-3 mb-1">{t('backup_rclone_install_synology')}</p>
                <code style={{ fontSize: '0.75rem', display: 'block', whiteSpace: 'pre-wrap' }}>
                  {`curl https://rclone.org/install.sh | bash`}
                </code>
                <p className="text-muted mt-3 mb-0" style={{ fontSize: '0.75rem' }}>
                  <i className="fas fa-info-circle me-1" />{t('backup_rclone_token_note')}
                </p>
              </div>
            </div>
          </div>
        </AdminCard>
      </form>

      <div className="row">

        {/* ── Left column ── */}
        <div className="col-lg-5">

          {/* Status card */}
          <AdminCard title={t('inspector_backup_status')} className="mb-3">
            {!lastSync && !status?.triggerPending ? (
              <p className="text-muted mb-0" style={{ fontSize: '0.82rem' }}>{t('inspector_backup_never')}</p>
            ) : (
              <>
                <div className="d-flex align-items-center gap-3 mb-3">
                  {syncState && (
                    <i
                      className={STATE_ICON[syncState]}
                      style={{ fontSize: '1.5rem', color: STATE_COLOR[syncState] }}
                    />
                  )}
                  <div>
                    <div className={`fw-semibold text-${STATE_VARIANT[syncState] ?? 'body'}`} style={{ fontSize: '0.95rem' }}>
                      {syncState === 'running' && t('inspector_backup_state_running')}
                      {syncState === 'success' && t('inspector_backup_state_success')}
                      {syncState === 'error'   && t('inspector_backup_state_error')}
                      {syncState === 'pending' && t('inspector_backup_state_pending')}
                    </div>
                    {lastSync?.started_at && (
                      <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                        {t('inspector_backup_started')} {fmtDate(lastSync.started_at)}
                      </div>
                    )}
                  </div>
                </div>
                {lastSync?.finished_at && (
                  <Row label={t('inspector_backup_finished')} value={`${fmtDate(lastSync.finished_at)} (${timeAgo(lastSync.finished_at)})`} />
                )}
                {lastSync?.trigger && (
                  <Row
                    label={t('inspector_backup_trigger')}
                    value={lastSync.trigger === 'ui' ? t('inspector_backup_trigger_ui') : t('inspector_backup_trigger_scheduled')}
                  />
                )}
                {lastSync?.error && (
                  <div className="alert alert-danger py-2 px-3 mb-0 mt-2" style={{ fontSize: '0.78rem' }}>
                    {lastSync.error}
                  </div>
                )}
                {status?.triggerPending && (
                  <div className="alert alert-warning py-2 px-3 mb-0 mt-2" style={{ fontSize: '0.78rem' }}>
                    <i className="fas fa-clock me-1" />{t('inspector_backup_trigger_pending')}
                  </div>
                )}
              </>
            )}
          </AdminCard>

          {/* Storage usage card */}
          <AdminCard
            title={t('inspector_backup_storage')}
            headerRight={<span className="text-muted" style={{ fontSize: '0.75rem' }}>{fmtBytes(totalBytes || null)} total</span>}
            className="mb-3"
          >
            {!status ? (
              <p className="text-muted" style={{ fontSize: '0.82rem' }}>{t('loading')}</p>
            ) : (
              <>
                <DiskBar label="private/"  bytes={du.private}  total={totalBytes} colorClass="success" />
                <DiskBar label="public/"   bytes={du.public}   total={totalBytes} colorClass="primary" />
                <DiskBar label="internal/" bytes={du.internal} total={totalBytes} colorClass="info" />
              </>
            )}
          </AdminCard>

          {/* DB dumps card */}
          <AdminCard title={t('inspector_backup_db_dumps')} noPadding className="mb-3">
            {!status?.dbDumps?.length ? (
              <p className="text-muted mb-0" style={{ fontSize: '0.82rem', padding: '0.75rem' }}>{t('inspector_backup_no_dumps')}</p>
            ) : (
              <table className="table table-sm table-hover mb-0">
                <tbody>
                  {status.dbDumps.map(d => (
                    <tr key={d.name}>
                      <td style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{d.name}</td>
                      <td className="text-muted text-end" style={{ fontSize: '0.75rem' }}>{fmtBytes(d.size)}</td>
                      <td className="text-muted text-end" style={{ fontSize: '0.72rem' }}>{timeAgo(d.mtime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </AdminCard>
        </div>

        {/* ── Right column — Log ── */}
        <div className="col-lg-7">
          <AdminCard
            title={t('inspector_backup_log')}
            headerRight={
              isActive
                ? <span className="text-primary" style={{ fontSize: '0.72rem' }}>
                    <i className="fas fa-circle fa-beat me-1" style={{ fontSize: '0.5rem' }} />
                    {t('inspector_backup_live')}
                  </span>
                : <span className="text-muted" style={{ fontSize: '0.72rem' }}>{t('inspector_backup_log_hint')}</span>
            }
            className="mb-3"
          >
            <div
              ref={logRef}
              style={{
                height: 'calc(100vh - 260px)',
                overflowY: 'auto',
                fontFamily: 'ui-monospace, monospace',
                fontSize: '0.72rem',
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                background: 'var(--bs-body-bg)',
                color: 'var(--bs-body-color)',
                padding: '0.5rem',
                borderRadius: 4,
                opacity: 0.9,
              }}
            >
              {logs || <span className="text-muted">{t('inspector_backup_no_log')}</span>}
            </div>
          </AdminCard>
        </div>

      </div>
    </AdminPage>
  );
}
