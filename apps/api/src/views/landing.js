// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/views/landing.js — server-rendered public gallery listing HTML

const LOCK_SVG = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="10" height="8" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2"/></svg>`;
const KEY_SVG  = `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="8" r="3.5"/><path d="M9 8h5.5M12.5 8v2M11 8v1.5"/></svg>`;

function fmtDateCard(dateRange, fallback) {
  const src = dateRange || (fallback ? { from: fallback, to: fallback } : null);
  if (!src?.from) return '';
  const parse = s => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00');
    if (/^\d{4}-\d{2}$/.test(s))       return new Date(s + '-01T12:00:00');
    return null;
  };
  const a = parse(src.from);
  const b = parse(src.to || src.from);
  if (!a) return '';
  const diff      = Math.round((b - a) / 86400000);
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const sameYear  = a.getFullYear() === b.getFullYear();
  const loc       = 'fr-CH';
  const ord       = d => d === 1 ? '1er' : String(d);
  const mLong     = d => d.toLocaleDateString(loc, { month: 'long' });
  const y         = a.getFullYear();

  // "23 mars 2026"
  if (diff === 0)
    return `${ord(a.getDate())} ${mLong(a)} ${y}`;
  // "23 et 24 mars 2026"
  if (diff === 1 && sameMonth)
    return `${ord(a.getDate())} et ${ord(b.getDate())} ${mLong(a)} ${y}`;
  // "juin 2026"
  if (sameMonth)
    return `${mLong(a)} ${y}`;
  // Short cross-month span ≤ 30 days: day precision
  if (diff <= 30) {
    if (sameYear)
      return `${ord(a.getDate())} ${mLong(a)} – ${ord(b.getDate())} ${mLong(b)} ${y}`;
    return `${ord(a.getDate())} ${mLong(a)} ${y} – ${ord(b.getDate())} ${mLong(b)} ${b.getFullYear()}`;
  }
  // Longer spans: month-level
  if (sameYear) {
    const monthDiff = b.getMonth() - a.getMonth();
    if (monthDiff === 1) return `${mLong(a)} et ${mLong(b)} ${y}`;
    if (diff < 300)      return `${mLong(a)} – ${mLong(b)} ${y}`;
    return String(y);
  }
  return `${mLong(a)} ${y} – ${mLong(b)} ${b.getFullYear()}`;
}

const ICON_CAMERA   = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>`;
const ICON_CALENDAR = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;

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
  const diff      = Math.round((to - from) / 86400000);
  const sameMonth = from.getFullYear() === to.getFullYear() && from.getMonth() === to.getMonth();
  const sameYear  = from.getFullYear() === to.getFullYear();
  const loc = 'fr-CH';
  const dNum = d => d.getDate();
  const mLong = d => d.toLocaleDateString(loc, { month: 'long' });
  const mY  = d => d.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const shM = d => d.toLocaleDateString(loc, { month: 'short', year: 'numeric' });
  if (diff === 0) return from.toLocaleDateString(loc, { day: 'numeric', month: 'long', year: 'numeric' });
  if (diff === 1 && sameMonth) return `Les ${dNum(from)} et ${dNum(to)} ${mLong(from)} ${from.getFullYear()}`;
  if (diff <= 4) {
    if (sameMonth) return `Du ${dNum(from)} au ${dNum(to)} ${mLong(from)} ${from.getFullYear()}`;
    return `Du ${dNum(from)} ${mLong(from)} au ${dNum(to)} ${mLong(to)} ${from.getFullYear()}`;
  }
  if (sameMonth) return mY(from);
  if (sameYear)  return `${mLong(from)} – ${mY(to)}`;
  return `${shM(from)} – ${shM(to)}`;
}

export function renderLanding(galleries, siteTitle = 'GalleryPack', isLoggedIn = false) {
  const cards = galleries.length === 0
    ? '<p style="color:#666;text-align:center;padding:3rem 0;grid-column:1/-1">No galleries published yet.</p>'
    : galleries.map(g => {
        const href = g.built ? `${g.slug}/` : null;
        const thumb = g.coverName
          ? `<img src="${g.slug}/img/grid/${g.coverName}.webp" style="width:100%;height:100%;object-fit:cover;display:block" alt="" onerror="this.style.display='none'">`
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
    <a class="logo" href="./">${esc(siteTitle)}</a>
  </header>
  <main style="flex:1">
    <div class="grid">${cards}</div>
  </main>
  <footer>
    <span class="brand">GalleryPack</span>
    <span class="sep">·</span>
    <a href="https://github.com/pvollenweider/gallerypack" target="_blank" rel="noreferrer">GitHub</a>
  </footer>
</body>
</html>`;
}

export function renderProjectIndex(projects, siteTitle = 'GalleryPack', isLoggedIn = false, orgName = '', orgDescHtml = '') {
  const title = orgName || siteTitle;
  const cards = projects.length === 0
    ? `<p class="empty">Aucun projet publié pour l'instant.</p>`
    : projects.map(p => {
        const href  = `${p.slug}/`;
        const thumb = p.coverName
          ? `<img src="${p.slug}/${p.coverSlug}/img/grid/${p.coverName}.webp" class="card-img" alt="" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="card-img-placeholder">&#128247;</div>`;
        const galleryLabel = p.galleryCount === 1 ? '1 galerie' : `${p.galleryCount} galeries`;
        const dateStr  = fmtDateCard(p.dateRange, null);
        const descLine = p.description
          ? `<p class="card-desc">${esc(p.description)}</p>`
          : '';
        return `<a href="${href}" class="card">
          <div class="card-cover">${thumb}</div>
          <div class="card-body">
            <h3 class="card-title">${esc(p.name)}</h3>
            ${dateStr ? `<p class="card-row">${ICON_CALENDAR} ${esc(dateStr)}</p>` : ''}
            ${descLine}
            <p class="card-count">${galleryLabel}</p>
          </div>
        </a>`;
      }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#1c1c1c;--ink:#e8e4dd;--muted:#706860;--accent:#c8a96e;--bar:56px}
    html,body{background:var(--bg);color:var(--ink);font-family:'Poppins',sans-serif;min-height:100vh}

    .bar{position:fixed;top:0;left:0;right:0;height:var(--bar);
      display:flex;align-items:center;padding:0 22px;
      background:rgba(0,0,0,.85);backdrop-filter:blur(18px) saturate(120%);
      -webkit-backdrop-filter:blur(18px) saturate(120%);
      border-bottom:1px solid rgba(255,255,255,.07);z-index:90}
    .bar-title{font-size:13px;font-weight:600;letter-spacing:-.01em;color:var(--ink)}

    .hero{max-width:1320px;margin:0 auto;padding:calc(var(--bar) + 52px) 32px 40px;text-align:center}
    .hero-title{font-size:clamp(26px,4.5vw,52px);font-weight:600;color:var(--ink);
      margin:0 0 14px;letter-spacing:-.02em;line-height:1.15}
    .hero-desc{max-width:700px;margin:0 auto;font-size:14px;font-weight:300;
      color:rgba(232,228,221,.65);line-height:1.85;text-align:left}
    .hero-desc p{margin:0 0 14px}.hero-desc p:last-child{margin-bottom:0}
    .hero-desc h2,.hero-desc h3{color:rgba(232,228,221,.9);margin:20px 0 8px;font-weight:600}
    .hero-desc a{color:var(--accent);text-decoration:none}.hero-desc a:hover{text-decoration:underline}
    .hero-divider{width:40px;height:1px;background:rgba(255,255,255,.1);margin:0 auto 48px}

    .grid{max-width:1320px;margin:0 auto;padding:0 24px 64px;
      display:flex;flex-wrap:wrap;gap:1.5rem;justify-content:center}
    .empty{color:var(--muted);text-align:center;padding:4rem 0;font-size:14px}

    .card{background:#232323;border:1px solid rgba(255,255,255,.06);border-radius:10px;
      overflow:hidden;text-decoration:none;display:flex;flex-direction:column;
      transition:border-color .2s,box-shadow .2s;
      flex:1 1 300px;max-width:calc(50% - 0.75rem)}
    @media(max-width:680px){.card{max-width:100%}}
    .card:hover{border-color:rgba(200,169,110,.3);box-shadow:0 8px 32px rgba(0,0,0,.45)}
    .card-cover{position:relative;aspect-ratio:4/3;background:#2a2a2a;overflow:hidden}
    .card-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}
    .card:hover .card-img{transform:scale(1.03)}
    .card-img-placeholder{width:100%;height:100%;display:flex;align-items:center;
      justify-content:center;font-size:2.5rem;color:#444}
    .card-body{padding:1rem 1.1rem 1.1rem;display:flex;flex-direction:column;gap:5px;flex:1}
    .card-title{font-size:15px;font-weight:600;color:var(--ink);letter-spacing:-.01em;line-height:1.3}
    .card-row{display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
    .card-row svg{opacity:.65;flex-shrink:0}
    .card-desc{font-size:12px;color:rgba(232,228,221,.45);line-height:1.6;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px}
    .card-count{font-size:10px;color:rgba(255,255,255,.2);letter-spacing:.06em;
      text-transform:uppercase;margin-top:auto;padding-top:6px}

    .footer{border-top:1px solid rgba(255,255,255,.06);padding:24px;
      text-align:center;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
      color:rgba(255,255,255,.15)}
  </style>
</head>
<body>
  <nav class="bar">
    <span class="bar-title">${esc(title)}</span>
  </nav>
  <main>
    <div class="hero">
      <h1 class="hero-title">${esc(title)}</h1>
      ${orgDescHtml ? `<div class="hero-desc">${orgDescHtml}</div>` : ''}
    </div>
    <div class="hero-divider"></div>
    <div class="grid">${cards}</div>
  </main>
  <footer class="footer">GalleryPack</footer>
</body>
</html>`;
}

export function renderProjectListing(projectSlug, projectName, galleries, siteTitle = 'GalleryPack', isLoggedIn = false, projectDescHtml = '', orgName = '') {
  const cards = galleries.length === 0
    ? `<p class="empty">Aucune galerie publiée pour l'instant.</p>`
    : galleries.map(g => {
        const href  = `${g.slug}/`;
        const thumb = g.coverName
          ? `<img src="${g.slug}/img/grid/${g.coverName}.webp" class="card-img" alt="" loading="lazy" onerror="this.style.display='none'">`
          : `<div class="card-img-placeholder">&#128247;</div>`;
        const dateStr    = fmtDateCard(g.dateRange, g.date);
        const photoLabel = g.photoCount === 1 ? '1 photo' : `${g.photoCount || 0} photos`;
        const pgLine   = g.photographers?.length > 0
          ? `<p class="card-row">${ICON_CAMERA} ${g.photographers.map(n => esc(n)).join('<span class="row-sep">·</span>')}</p>`
          : '';
        const dateLine = dateStr
          ? `<p class="card-row">${ICON_CALENDAR} ${esc(dateStr)}</p>`
          : '';
        const descLine = g.description
          ? `<p class="card-desc">${esc(g.description)}</p>`
          : '';
        return `<a href="${href}" class="card">
          <div class="card-cover">${thumb}</div>
          <div class="card-body">
            <h3 class="card-title">${esc(g.title || g.slug)}</h3>
            ${pgLine}
            ${dateLine}
            ${descLine}
            <p class="card-count">${photoLabel}</p>
          </div>
        </a>`;
      }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <title>${esc(projectName)} — ${esc(siteTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#1c1c1c;--ink:#e8e4dd;--muted:#706860;--accent:#c8a96e;--bar:56px}
    html,body{background:var(--bg);color:var(--ink);font-family:'Poppins',sans-serif;min-height:100vh}

    /* ── Top bar ── */
    .bar{position:fixed;top:0;left:0;right:0;height:var(--bar);
      display:flex;align-items:center;justify-content:space-between;padding:0 22px;
      background:rgba(0,0,0,.85);backdrop-filter:blur(18px) saturate(120%);
      -webkit-backdrop-filter:blur(18px) saturate(120%);
      border-bottom:1px solid rgba(255,255,255,.07);z-index:90}
    .bar-back{font-size:11px;letter-spacing:.07em;text-transform:uppercase;
      color:var(--muted);text-decoration:none;transition:color .2s}
    .bar-back:hover{color:var(--ink)}
    .bar-title{font-size:13px;font-weight:600;letter-spacing:-.01em;color:var(--ink)}
    /* ── Hero ── */
    .hero{max-width:1320px;margin:0 auto;padding:calc(var(--bar) + 52px) 32px 40px;text-align:center}
    .hero-title{font-size:clamp(26px,4.5vw,52px);font-weight:600;color:var(--ink);
      margin:0 0 14px;letter-spacing:-.02em;line-height:1.15}
    .hero-desc{max-width:700px;margin:0 auto;font-size:14px;font-weight:300;
      color:rgba(232,228,221,.65);line-height:1.85;text-align:left}
    .hero-desc p{margin:0 0 14px}.hero-desc p:last-child{margin-bottom:0}
    .hero-desc h2,.hero-desc h3{color:rgba(232,228,221,.9);margin:20px 0 8px;font-weight:600}
    .hero-desc a{color:var(--accent);text-decoration:none}.hero-desc a:hover{text-decoration:underline}
    .hero-divider{width:40px;height:1px;background:rgba(255,255,255,.1);margin:0 auto 48px}

    /* ── Grid ── */
    .grid{max-width:1320px;margin:0 auto;padding:0 24px 64px;
      display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1.5rem;justify-content:center}
    .empty{color:var(--muted);text-align:center;padding:4rem 0;grid-column:1/-1;font-size:14px}

    /* ── Card ── */
    .card{background:#232323;border:1px solid rgba(255,255,255,.06);border-radius:10px;
      overflow:hidden;text-decoration:none;display:flex;flex-direction:column;
      transition:border-color .2s,box-shadow .2s}
    .card:hover{border-color:rgba(200,169,110,.3);box-shadow:0 8px 32px rgba(0,0,0,.45)}
    .card-cover{position:relative;aspect-ratio:4/3;background:#2a2a2a;overflow:hidden}
    .card-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .4s}
    .card:hover .card-img{transform:scale(1.03)}
    .card-img-placeholder{width:100%;height:100%;display:flex;align-items:center;
      justify-content:center;font-size:2.5rem;color:#444}
    .card-body{padding:1rem 1.1rem 1.1rem;display:flex;flex-direction:column;gap:5px;flex:1}
    .card-title{font-size:15px;font-weight:600;color:var(--ink);letter-spacing:-.01em;line-height:1.3}
    .card-row{display:flex;align-items:center;gap:6px;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent)}
    .card-row svg{opacity:.65;flex-shrink:0}
    .row-sep{margin:0 5px;opacity:.4}
    .card-desc{font-size:12px;color:rgba(232,228,221,.45);line-height:1.6;
      display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-top:2px}
    .card-count{font-size:10px;color:rgba(255,255,255,.2);letter-spacing:.06em;
      text-transform:uppercase;margin-top:auto;padding-top:6px}

    /* ── Footer ── */
    .footer{border-top:1px solid rgba(255,255,255,.06);padding:24px;
      text-align:center;font-size:10px;letter-spacing:.1em;text-transform:uppercase;
      color:rgba(255,255,255,.15)}
    .footer a{color:rgba(255,255,255,.15);text-decoration:none;transition:color .2s}
    .footer a:hover{color:rgba(255,255,255,.45)}
    .footer .sep{margin:0 10px;opacity:.5}
  </style>
</head>
<body>
  <nav class="bar">
    <a class="bar-back" href="../">← ${esc(orgName || siteTitle)}</a>
    <span class="bar-title">${esc(projectName)}</span>
  </nav>
  <main>
    <div class="hero">
      <h1 class="hero-title">${esc(projectName)}</h1>
      ${projectDescHtml ? `<div class="hero-desc">${projectDescHtml}</div>` : ''}
    </div>
    <div class="hero-divider"></div>
    <div class="grid">${cards}</div>
  </main>
  <footer class="footer">
    <a href="../">← ${esc(orgName || siteTitle)}</a>
  </footer>
</body>
</html>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
