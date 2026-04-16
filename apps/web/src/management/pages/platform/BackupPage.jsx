// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../../lib/api.js';
import { useT } from '../../../lib/I18nContext.jsx';
import { AdminPage, AdminCard, AdminButton, AdminAlert } from '../../../components/ui/index.js';

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
  if (diff < 60)    return 'à l'instant';
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BackupPage() {
  const t = useT();
  const [status, setStatus]   = useState(null);
  const [logs, setLogs]       = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [error, setError]     = useState('');
  const logRef = useRef(null);

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
