// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/views/landing.js — server-rendered public gallery listing HTML

const LOCK_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>`;
const KEY_SVG  = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="8" r="3.5"/><path d="M9 8h5.5M12.5 8v2M11 8v1.5"/></svg>`;

function fmtDateRange(dateRange, fallback) {
  const src = dateRange || (fallback ? { from: fallback, to: fallback } : null);
  if (!src?.from) return fallback || null;
  const parse = s => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00');
    if (/^\d{4}-\d{2}$/.test(s))       return new Date(s + '-01T12:00:00');
    return null;
  };
  const from = parse(src.from);
  const to   = parse(src.to || src.from);
  if (!from) return fallback || null;
  const sameDay   = from.toISOString().slice(0,10) === to.toISOString().slice(0,10);
  const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  const sameYear  = from.getFullYear() === to.getFullYear();
  const mY  = d => d.toLocaleDateString('fr-CH', { month:'long', year:'numeric' });
  const dM  = d => d.toLocaleDateString('fr-CH', { day:'numeric', month:'long', year:'numeric' });
  const shM = d => d.toLocaleDateString('fr-CH', { month:'short', year:'numeric' });
  if (sameDay)   return dM(from);
  if (sameMonth) return mY(from);
  if (sameYear)  return `${from.toLocaleDateString('fr-CH',{month:'long'})} – ${mY(to)}`;
  return `${shM(from)} – ${shM(to)}`;
}

export function renderLanding(galleries, siteTitle = 'GalleryPack', isLoggedIn = false) {
  const cards = galleries.length === 0
    ? '<p style="color:#666;text-align:center;padding:3rem 0;grid-column:1/-1">No galleries published yet.</p>'
    : galleries.map(g => {
        const href = g.built ? `/${g.slug}/` : null;
        const thumb = g.coverName
          ? `<img src="/${g.slug}/img/grid/${g.coverName}.webp" style="width:100%;height:100%;object-fit:cover;display:block" alt="" onerror="this.style.display='none'">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#555">&#128247;</div>`;

        // SVG badges overlaid on the image
        const badgeStyle = 'display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);border-radius:50%';
        const lockBadge  = g.access === 'password'
          ? `<span style="${badgeStyle}" title="Password protected">${KEY_SVG}</span>` : '';
        const notBuilt = !g.built
          ? `<span style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.5);color:#fff;border-radius:4px;padding:2px 8px;font-size:0.72rem">Not published</span>`
          : '';
        // Badges top-right: stack lock + key if needed
        const cornerBadges = lockBadge
          ? `<span style="position:absolute;top:8px;right:8px;display:flex;gap:4px">${lockBadge}</span>`
          : '';

        const photoLabel = g.photoCount === 1 ? '1 photo' : `${g.photoCount || 0} photos`;
        const dateLabel  = fmtDateRange(g.dateRange, g.date);
        const inner = `
          <div style="position:relative;height:180px;background:#2a2a2a;overflow:hidden">${thumb}${cornerBadges}${notBuilt}</div>
          <div style="padding:0.75rem 1rem 0.85rem">
            <h3 style="margin:0 0 0.15rem;font-size:0.95rem;font-weight:600;color:#eee">${esc(g.title)}</h3>
            ${dateLabel ? `<p style="margin:0 0 0.15rem;font-size:0.78rem;color:#aaa">${esc(dateLabel)}</p>` : ''}
            ${g.location ? `<p style="margin:0 0 0.15rem;font-size:0.78rem;color:#aaa">${esc(g.location)}</p>` : ''}
            ${g.description ? `<p style="margin:0 0 0.25rem;font-size:0.8rem;color:#bbb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.description)}</p>` : ''}
            <p style="margin:0;font-size:0.75rem;color:#666">${photoLabel}</p>
          </div>`;
        return href
          ? `<a href="${href}" style="background:#272727;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.3);text-decoration:none;display:block;transition:box-shadow 0.15s" onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.5)'" onmouseout="this.style.boxShadow='0 1px 6px rgba(0,0,0,0.3)'">${inner}</a>`
          : `<div style="background:#272727;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.3);opacity:0.5">${inner}</div>`;
      }).join('');

  const adminHeaderBtn = isLoggedIn
    ? `<a class="admin-link" href="/admin/">Admin</a>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(siteTitle)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#1c1c1c;min-height:100vh}
    header{background:#222;border-bottom:1px solid #333;padding:0 1.5rem;height:52px;display:flex;align-items:center;justify-content:space-between}
    .logo{font-weight:700;letter-spacing:-0.02em;font-size:1rem;color:#fff;text-decoration:none}
    .admin-link{font-size:0.82rem;color:#aaa;text-decoration:none;padding:0.3rem 0.75rem;border:1px solid #444;border-radius:5px}
    main{max-width:1100px;width:100%;margin:0 auto;padding:1.5rem}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem}
    footer{border-top:1px solid #333;padding:0.75rem 1.5rem;display:flex;align-items:center;gap:0.5rem;font-size:0.78rem;color:#555}
    footer a{color:#555;text-decoration:none}
    footer .brand{font-weight:600;color:#777;letter-spacing:-0.01em}
    footer .sep{color:#444}
  </style>
</head>
<body style="display:flex;flex-direction:column;min-height:100vh">
  <header>
    <a class="logo" href="/">${esc(siteTitle)}</a>
    ${adminHeaderBtn}
  </header>
  <main style="flex:1">
    <div class="grid">${cards}</div>
  </main>
  <footer>
    <span class="brand">GalleryPack</span>
    <span class="sep">·</span>
    <a href="https://github.com/pvollenweider/gallerypack" target="_blank" rel="noreferrer">GitHub</a>
    <span class="sep">·</span>
    <a href="/admin/">Admin</a>
  </footer>
</body>
</html>`;
}

export function renderProjectListing(projectSlug, projectName, galleries, siteTitle = 'GalleryPack', isLoggedIn = false) {
  const cards = galleries.length === 0
    ? '<p style="color:#666;text-align:center;padding:3rem 0;grid-column:1/-1">No galleries published yet.</p>'
    : galleries.map(g => {
        const href  = `/${projectSlug}/${g.slug}/`;
        const thumb = g.coverName
          ? `<img src="${href}img/grid/${g.coverName}.webp" style="width:100%;height:100%;object-fit:cover;display:block" alt="" onerror="this.style.display='none'">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#555">&#128247;</div>`;
        const dateLabel  = fmtDateRange(g.dateRange, g.date);
        const photoLabel = g.photoCount === 1 ? '1 photo' : `${g.photoCount || 0} photos`;
        const inner = `
          <div style="position:relative;height:180px;background:#2a2a2a;overflow:hidden">${thumb}</div>
          <div style="padding:0.75rem 1rem 0.85rem">
            <h3 style="margin:0 0 0.15rem;font-size:0.95rem;font-weight:600;color:#eee">${esc(g.title || g.slug)}</h3>
            ${dateLabel ? `<p style="margin:0 0 0.15rem;font-size:0.78rem;color:#aaa">${esc(dateLabel)}</p>` : ''}
            ${g.location ? `<p style="margin:0 0 0.15rem;font-size:0.78rem;color:#aaa">${esc(g.location)}</p>` : ''}
            <p style="margin:0;font-size:0.75rem;color:#666">${photoLabel}</p>
          </div>`;
        return `<a href="${href}" style="background:#272727;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.3);text-decoration:none;display:block;transition:box-shadow 0.15s" onmouseover="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.5)'" onmouseout="this.style.boxShadow='0 1px 6px rgba(0,0,0,0.3)'">${inner}</a>`;
      }).join('');

  const adminBtn = isLoggedIn ? `<a class="admin-link" href="/admin/">Admin</a>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(projectName)} — ${esc(siteTitle)}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#1c1c1c;min-height:100vh}
    header{background:#222;border-bottom:1px solid #333;padding:0 1.5rem;height:52px;display:flex;align-items:center;justify-content:space-between;gap:1rem}
    .back{font-size:0.82rem;color:#aaa;text-decoration:none}
    .back:hover{color:#fff}
    .logo{font-weight:700;letter-spacing:-0.02em;font-size:1rem;color:#fff;text-decoration:none;flex:1;text-align:center}
    .admin-link{font-size:0.82rem;color:#aaa;text-decoration:none;padding:0.3rem 0.75rem;border:1px solid #444;border-radius:5px}
    main{max-width:1100px;width:100%;margin:0 auto;padding:1.5rem}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem}
    footer{border-top:1px solid #333;padding:0.75rem 1.5rem;display:flex;align-items:center;gap:0.5rem;font-size:0.78rem;color:#555}
    footer a{color:#555;text-decoration:none}
    footer .brand{font-weight:600;color:#777;letter-spacing:-0.01em}
    footer .sep{color:#444}
  </style>
</head>
<body style="display:flex;flex-direction:column;min-height:100vh">
  <header>
    <a class="back" href="/">← ${esc(siteTitle)}</a>
    <span class="logo">${esc(projectName)}</span>
    ${adminBtn}
  </header>
  <main style="flex:1">
    <div class="grid">${cards}</div>
  </main>
  <footer>
    <span class="brand">GalleryPack</span>
    <span class="sep">·</span>
    <a href="/admin/">Admin</a>
  </footer>
</body>
</html>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
