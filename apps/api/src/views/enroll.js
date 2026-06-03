// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/views/enroll.js — server-rendered enrollment page (double opt-in)

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
 * Render the public enrollment page.
 *
 * @param {string|null} galleryTitle - Title of the gallery (or null for generic)
 * @param {string}      galleryRef   - Gallery ID used as the form action target
 * @param {string|null} errorMsg     - If set, show an inline error message
 * @param {string|null} successEmail - If set, show success confirmation with the email address
 * @returns {string} Full HTML document
 */
export function renderEnrollPage(galleryTitle, galleryRef, errorMsg = null, successEmail = null) {
  const title = galleryTitle ? esc(galleryTitle) : 'Accès vidéo privée';

  const statusBlock = successEmail
    ? `<div class="status status--success">
        Un e-mail de confirmation a été envoyé à <strong>${esc(successEmail)}</strong>.
        Cliquez le lien qu'il contient pour accéder à la vidéo.
      </div>`
    : errorMsg
      ? `<div class="status status--error">${esc(errorMsg)}</div>`
      : '';

  const formBlock = successEmail
    ? '' // hide form after success
    : `<form method="POST" action="/enroll/${esc(galleryRef)}" class="enroll-form" id="enrollForm">
        <label for="email" class="field-label">Votre adresse e-mail</label>
        <input
          type="email"
          id="email"
          name="email"
          class="field-input"
          placeholder="prenom.nom@exemple.com"
          required
          autocomplete="email"
          autocapitalize="none"
          autocorrect="off"
          spellcheck="false"
        >
        <button type="submit" class="btn-submit">Demander l'accès</button>
      </form>
      <p class="nLPD-notice">
        Votre e-mail est utilisé uniquement pour vous envoyer votre lien d'accès personnel.
        Il ne sera pas partagé ni utilisé à d'autres fins.
      </p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      min-height: 100%;
      background: #0f0f0f;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
    }
    .card {
      width: 100%;
      max-width: 440px;
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 2.5rem 2rem;
    }
    .card-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #f0f0f0;
      margin-bottom: .5rem;
      line-height: 1.4;
    }
    .card-subtitle {
      font-size: .875rem;
      color: #888;
      margin-bottom: 2rem;
      line-height: 1.5;
    }
    .status {
      border-radius: 8px;
      padding: .875rem 1rem;
      font-size: .875rem;
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }
    .status--success {
      background: #0d2b1a;
      border: 1px solid #1a5c35;
      color: #5ece8a;
    }
    .status--success strong { color: #8be0ac; }
    .status--error {
      background: #2b0d0d;
      border: 1px solid #5c1a1a;
      color: #e08b8b;
    }
    .enroll-form {
      display: flex;
      flex-direction: column;
      gap: .875rem;
      margin-bottom: 1.25rem;
    }
    .field-label {
      font-size: .8125rem;
      font-weight: 500;
      color: #aaa;
      margin-bottom: .25rem;
      display: block;
    }
    .field-input {
      width: 100%;
      padding: .6875rem .875rem;
      background: #111;
      border: 1px solid #333;
      border-radius: 8px;
      color: #f0f0f0;
      font-size: .9375rem;
      outline: none;
      transition: border-color .15s;
    }
    .field-input:focus {
      border-color: #555;
    }
    .field-input::placeholder {
      color: #555;
    }
    .btn-submit {
      padding: .75rem 1.25rem;
      background: #fff;
      color: #111;
      border: none;
      border-radius: 8px;
      font-size: .9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: background .15s;
    }
    .btn-submit:hover { background: #e8e8e8; }
    .btn-submit:active { background: #d5d5d5; }
    .nLPD-notice {
      font-size: .75rem;
      color: #555;
      line-height: 1.5;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="card">
    <p class="card-title">${title}</p>
    <p class="card-subtitle">Cette vidéo vous est destinée dans un cadre strictement privé.</p>
    ${statusBlock}
    ${formBlock}
  </div>
  <script>
    // Submit via fetch to stay on the same page and show inline feedback
    const form = document.getElementById('enrollForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type=submit]');
        btn.disabled = true;
        btn.textContent = 'Envoi…';
        try {
          const res = await fetch('/api/enroll/${esc(galleryRef)}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: form.email.value.trim().toLowerCase() }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok) {
            // Replace page with success state
            window.location.href = '/enroll/${esc(galleryRef)}?sent=' + encodeURIComponent(form.email.value.trim());
          } else {
            btn.disabled = false;
            btn.textContent = "Demander l'accès";
            const existing = form.parentNode.querySelector('.status--error');
            if (existing) existing.remove();
            const div = document.createElement('div');
            div.className = 'status status--error';
            div.textContent = data.error || 'Une erreur est survenue. Veuillez réessayer.';
            form.parentNode.insertBefore(div, form);
          }
        } catch {
          btn.disabled = false;
          btn.textContent = "Demander l'accès";
        }
      });
    }
  </script>
</body>
</html>`;
}
