// apps/api/src/views/landing.js — server-rendered public gallery listing HTML
export function renderLanding(galleries) {
  const cards = galleries.length === 0
    ? '<p style="color:#999;text-align:center;padding:3rem 0;grid-column:1/-1">No galleries published yet.</p>'
    : galleries.map(g => {
        const href = g.built ? `/${g.slug}/` : null;
        const thumb = g.coverName
          ? `<img src="/${g.slug}/img/grid/${g.coverName}.webp" style="width:100%;height:100%;object-fit:cover;display:block" alt="" onerror="this.style.display='none'">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:2.5rem;color:#ccc">&#128247;</div>`;
        const lock = g.access === 'password'
          ? `<span style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:#fff;border-radius:99px;padding:3px 8px;font-size:0.75rem">&#128274;</span>`
          : '';
        const notBuilt = !g.built
          ? `<span style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.5);color:#fff;border-radius:4px;padding:2px 8px;font-size:0.72rem">Not published</span>`
          : '';
        const inner = `
          <div style="position:relative;height:180px;background:#f4f4f4;overflow:hidden">${thumb}${lock}${notBuilt}</div>
          <div style="padding:0.75rem 1rem 0.85rem">
            <h3 style="margin:0 0 0.2rem;font-size:0.95rem;font-weight:600;color:#111">${esc(g.title)}</h3>
            ${g.date ? `<p style="margin:0 0 0.15rem;font-size:0.8rem;color:#888">${esc(g.date)}</p>` : ''}
            ${g.location ? `<p style="margin:0;font-size:0.8rem;color:#888">${esc(g.location)}</p>` : ''}
          </div>`;
        return href
          ? `<a href="${href}" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07);text-decoration:none;display:block;transition:box-shadow 0.15s" onmouseover="this.style.boxShadow='0 4px 16px rgba(0,0,0,0.13)'" onmouseout="this.style.boxShadow='0 1px 6px rgba(0,0,0,0.07)'">${inner}</a>`
          : `<div style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.07);opacity:0.6">${inner}</div>`;
      }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Galleries</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8f8f8;min-height:100vh}
    header{background:#fff;border-bottom:1px solid #eee;padding:0 1.5rem;height:52px;display:flex;align-items:center;justify-content:space-between}
    .logo{font-weight:700;letter-spacing:-0.02em;font-size:1rem;color:#111;text-decoration:none}
    .admin-link{font-size:0.82rem;color:#888;text-decoration:none;padding:0.3rem 0.75rem;border:1px solid #ddd;border-radius:5px}
    main{max-width:1100px;margin:0 auto;padding:1.5rem}
    h2{font-size:1.2rem;font-weight:700;margin-bottom:1rem;color:#111}
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:1rem}
  </style>
</head>
<body>
  <header>
    <a class="logo" href="/">GalleryPack</a>
    <a class="admin-link" href="/admin">Admin</a>
  </header>
  <main>
    <h2>Galleries</h2>
    <div class="grid">${cards}</div>
  </main>
</body>
</html>`;
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
