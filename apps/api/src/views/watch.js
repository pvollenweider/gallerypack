// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/views/watch.js — server-rendered public video viewer page

/**
 * Format seconds as "m:ss" or "h:mm:ss".
 * @param {number|null} sec
 * @returns {string}
 */
function fmtDuration(sec) {
  if (!sec || sec < 0) return '';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${ss}`;
  return `${m}:${ss}`;
}

/**
 * Escape HTML special characters for safe interpolation.
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the public video viewer HTML page.
 *
 * @param {string} token         - The viewer token from the URL
 * @param {object|null} gallery  - { id, title } or null on error
 * @param {Array}  videos        - Array of { id, title, slug, duration_sec, hls_entry }
 * @param {string} [errorMsg]    - If set, render the error page instead
 * @returns {string} Full HTML document
 */
export function renderWatchPage(token, gallery, videos, errorMsg) {
  /* ── Error page ─────────────────────────────────────────────────────────── */
  if (errorMsg) {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Lien invalide</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      background: #0f0f0f;
      color: #999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .msg { padding: 2rem; }
    .msg p { margin: .4rem 0; font-size: 1.05rem; }
  </style>
</head>
<body>
  <div class="msg">
    <p>Ce lien n'est plus valide.</p>
    <p>This link is no longer valid.</p>
  </div>
</body>
</html>`;
  }

  /* ── Normal page ────────────────────────────────────────────────────────── */
  const hasMultiple = videos.length > 1;
  const firstVideo  = videos[0] ?? null;

  // Build sidebar items (only rendered when hasMultiple)
  const sidebarItems = videos.map((v, i) => {
    const dur   = fmtDuration(v.duration_sec);
    const hlsUrl = `/api/v/${esc(token)}/galleries/${esc(gallery.id)}/videos/${esc(v.slug)}/stream/${esc(v.hls_entry)}`;
    return `    <li class="vl-item${i === 0 ? ' vl-item--active' : ''}" data-index="${i}" data-hls="${hlsUrl}" data-title="${esc(v.title)}">
      <span class="vl-title">${esc(v.title)}</span>${dur ? `<span class="vl-dur">${esc(dur)}</span>` : ''}
    </li>`;
  }).join('\n');

  const firstHlsUrl = firstVideo
    ? `/api/v/${token}/galleries/${gallery.id}/videos/${firstVideo.slug}/stream/${firstVideo.hls_entry}`
    : '';

  // Serialise videos list for the client-side JS
  const videosJson = JSON.stringify(videos.map(v => ({
    id:       v.id,
    title:    v.title,
    slug:     v.slug,
    hlsEntry: v.hls_entry,
  })));

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(gallery.title)}</title>
  <link rel="stylesheet" href="https://vjs.zencdn.net/8.21.1/video-js.css">
  <style>
    /* ── Reset / base ──────────────────────────────────────────────────────── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      background: #0f0f0f;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
    }

    /* ── Layout ────────────────────────────────────────────────────────────── */
    #app {
      display: flex;
      height: 100vh;
      width: 100vw;
    }

    /* Sidebar (multiple videos only) */
    #sidebar {
      width: 280px;
      min-width: 220px;
      max-width: 340px;
      background: #161616;
      border-right: 1px solid #2a2a2a;
      overflow-y: auto;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
    }
    #sidebar-header {
      padding: .85rem 1rem .6rem;
      font-size: .78rem;
      font-weight: 600;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: #555;
      border-bottom: 1px solid #222;
      flex-shrink: 0;
    }
    .vl-list { list-style: none; padding: .3rem 0; flex: 1; }
    .vl-item {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: .5rem;
      padding: .65rem 1rem;
      cursor: pointer;
      border-left: 3px solid transparent;
      transition: background .12s, border-color .12s;
      font-size: .88rem;
    }
    .vl-item:hover { background: #1f1f1f; }
    .vl-item--active {
      background: #1a2230;
      border-left-color: #4a8fd4;
      color: #fff;
    }
    .vl-title { flex: 1; line-height: 1.35; }
    .vl-dur {
      color: #666;
      font-size: .78rem;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .vl-item--active .vl-dur { color: #7aabdf; }

    /* Main area */
    #main {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    #player-wrap {
      flex: 1;
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    #player-wrap .video-js {
      width: 100%;
      height: 100%;
    }

    /* Reminder bar */
    #reminder {
      padding: .45rem 1rem;
      font-size: .72rem;
      color: #444;
      text-align: center;
      border-top: 1px solid #1e1e1e;
      flex-shrink: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ── Video.js overrides ─────────────────────────────────────────────────── */
    .video-js { background: #000; }
    .vjs-big-play-button {
      border-radius: 50% !important;
      width: 2.5em !important;
      height: 2.5em !important;
      line-height: 2.5em !important;
      top: 50% !important;
      left: 50% !important;
      transform: translate(-50%, -50%) !important;
      margin: 0 !important;
    }

    /* ±10s buttons */
    .vjs-seek-button .vjs-icon-placeholder::before {
      font-family: VideoJS;
      font-size: 1.4em;
      line-height: 1.67;
    }
    .vjs-seek-back-10  .vjs-icon-placeholder::before { content: '\\f11b'; }
    .vjs-seek-fwd-10   .vjs-icon-placeholder::before { content: '\\f11c'; }

    /* ── Mobile / narrow-screen ─────────────────────────────────────────────── */
    @media (max-width: 640px) {
      html, body { overflow: auto; }
      #app { flex-direction: column; height: auto; min-height: 100vh; }
      #sidebar {
        width: 100%;
        max-width: 100%;
        border-right: none;
        border-bottom: 1px solid #2a2a2a;
        max-height: 40vh;
      }
      #main { flex: none; }
      #player-wrap { aspect-ratio: 16/9; height: auto; }
      #player-wrap .video-js { height: 100%; }
      #reminder { white-space: normal; }
    }
  </style>
</head>
<body>
<div id="app">
  ${hasMultiple ? `<aside id="sidebar">
    <div id="sidebar-header">Vidéos</div>
    <ul class="vl-list">
${sidebarItems}
    </ul>
  </aside>` : ''}
  <div id="main">
    <div id="player-wrap">
      <video id="main-video"
             class="video-js vjs-default-skin vjs-big-play-centered"
             preload="auto"
             playsinline>
      </video>
    </div>
    <div id="reminder">Ce lien vous est personnel&nbsp;— merci de ne pas le partager.&ensp;·&ensp;This link is personal — please do not share it.</div>
  </div>
</div>

<script src="https://vjs.zencdn.net/8.21.1/video.min.js"></script>
<script>
(function () {
  'use strict';

  /* ── Config ────────────────────────────────────────────────────────────── */
  var TOKEN      = ${JSON.stringify(token)};
  var GALLERY_ID = ${JSON.stringify(gallery.id)};
  var VIDEOS     = ${videosJson};
  var hasMultiple = ${hasMultiple ? 'true' : 'false'};

  /* ── Tracking ──────────────────────────────────────────────────────────── */
  var currentVideoId = ${firstVideo ? JSON.stringify(firstVideo.id) : 'null'};

  function sendTrack(eventType, positionSec) {
    if (!currentVideoId) return;
    try {
      var body = JSON.stringify({
        video_id:     currentVideoId,
        event_type:   eventType,
        position_sec: positionSec != null ? Math.round(positionSec) : null,
      });
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/v/' + TOKEN + '/track', blob);
      } else {
        fetch('/api/v/' + TOKEN + '/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true,
        }).catch(function () {});
      }
    } catch (e) {}
  }

  /* ── ±10 s button component ────────────────────────────────────────────── */
  function makeSeekButton(direction, label, className) {
    var Button = videojs.getComponent('Button');
    var SeekBtn = videojs.extend(Button, {
      constructor: function (player, options) {
        Button.call(this, player, options);
        this.addClass(className);
        this.controlText(label);
      },
      handleClick: function () {
        var t = this.player_.currentTime();
        this.player_.currentTime(Math.max(0, t + direction * 10));
      },
    });
    return SeekBtn;
  }

  videojs.registerComponent('SeekBack10', makeSeekButton(-1, 'Reculer 10s', 'vjs-seek-back-10'));
  videojs.registerComponent('SeekFwd10',  makeSeekButton(+1, 'Avancer 10s',  'vjs-seek-fwd-10'));

  /* ── Player init ───────────────────────────────────────────────────────── */
  var player = videojs('main-video', {
    controls:      true,
    fluid:         true,
    responsive:    true,
    playbackRates: [0.5, 1, 1.25, 1.5, 2],
    html5: {
      vhs: {
        overrideNative: !videojs.browser.IS_SAFARI,
      },
    },
    controlBar: {
      children: [
        'playToggle',
        'SeekBack10',
        'SeekFwd10',
        'volumePanel',
        'currentTimeDisplay',
        'timeDivider',
        'durationDisplay',
        'progressControl',
        'playbackRateMenuButton',
        'fullscreenToggle',
      ],
    },
  });

  function loadVideo(slug, hlsEntry, videoId, title) {
    currentVideoId = videoId;
    var url = '/api/v/' + TOKEN + '/galleries/' + GALLERY_ID + '/videos/' + slug + '/stream/' + hlsEntry;
    player.src({ src: url, type: 'application/x-mpegURL' });
    player.play().catch(function () {});
  }

  /* Load first video */
  if (VIDEOS.length > 0) {
    var first = VIDEOS[0];
    loadVideo(first.slug, first.hlsEntry, first.id, first.title);
  }

  /* ── Tracking events ───────────────────────────────────────────────────── */
  player.on('play',   function () { sendTrack('play',   player.currentTime()); });
  player.on('pause',  function () { sendTrack('pause',  player.currentTime()); });
  player.on('seeked', function () { sendTrack('seek',   player.currentTime()); });
  player.on('ended',  function () { sendTrack('ended',  player.currentTime()); });

  var heartbeatTimer = null;
  player.on('play',  function () {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(function () {
      if (!player.paused()) sendTrack('heartbeat', player.currentTime());
    }, 30000);
  });
  player.on('pause', function () {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  });
  player.on('ended', function () {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  });

  /* ── Sidebar interaction ───────────────────────────────────────────────── */
  if (hasMultiple) {
    var items = document.querySelectorAll('.vl-item');
    items.forEach(function (el) {
      el.addEventListener('click', function () {
        var idx = parseInt(el.dataset.index, 10);
        var v   = VIDEOS[idx];
        if (!v) return;
        items.forEach(function (i) { i.classList.remove('vl-item--active'); });
        el.classList.add('vl-item--active');
        loadVideo(v.slug, v.hlsEntry, v.id, v.title);
      });
    });
  }
})();
</script>
</body>
</html>`;
}
