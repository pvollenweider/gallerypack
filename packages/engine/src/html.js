// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of GalleryPack.
//
// GalleryPack is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// GalleryPack is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

// packages/engine/src/html.js — HTML/JS generation for galleries and site index
import fs   from 'fs';
import path from 'path';
import crypto from 'crypto';

import { DIST_ROOT } from './fs.js';
import { generatePassword } from './utils.js';
import { BIG_POSITIONS } from './images.js';

// Inline logging helpers (copied to avoid circular-dependency risk).
const ok   = (m) => process.stdout.write(`  \x1b[32m✓\x1b[0m  ${m}\n`);

// ── HTML escaping ─────────────────────────────────────────────────────────────

/**
 * Escape a string for safe insertion into an HTML attribute or text node.
 *
 * @param {string} s - Raw string.
 * @returns {string} - HTML-safe string.
 */
export function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Date phrase for hero-authors ("prises le / les / en …") ─────────────────

/**
 * Build a French date phrase for the "Photos de …" line.
 *
 * Rules:
 *   same day              → "prises le 28 mars 2026"
 *   2 days, same month    → "prises les 28 et 29 mars 2026"
 *   2 days, diff months   → "prises les 28 mars et 1er avril 2026"
 *   >2 days, same month   → "prises en mars 2026"
 *   >2 days, diff months  → "prises en mars et avril 2026"
 *
 * @param {string|null} from  YYYY-MM-DD
 * @param {string|null} to    YYYY-MM-DD (optional)
 * @returns {string}
 */
function fmtPrisesLe(from, to) {
  if (!from) return '';
  const parse = s => new Date(s + 'T12:00:00');
  const a = parse(from);
  const b = to ? parse(to) : a;
  const diff = Math.round((b - a) / 86400000);
  const loc  = 'fr-CH';
  const ord  = d => d === 1 ? '1er' : String(d);
  const mLong = d => d.toLocaleDateString(loc, { month: 'long' });
  const y = a.getFullYear();
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  const sameYear  = a.getFullYear() === b.getFullYear();

  if (diff === 0)
    return `prises le ${ord(a.getDate())} ${mLong(a)} ${y}`;
  if (diff === 1) {
    if (sameMonth)
      return `prises les ${ord(a.getDate())} et ${ord(b.getDate())} ${mLong(a)} ${y}`;
    return `prises les ${ord(a.getDate())} ${mLong(a)} et ${ord(b.getDate())} ${mLong(b)} ${y}`;
  }
  // > 2 days
  if (sameMonth)
    return `prises en ${mLong(a)} ${y}`;
  if (sameYear)
    return `prises en ${mLong(a)} et ${mLong(b)} ${y}`;
  return `prises en ${mLong(a)} ${y} et ${mLong(b)} ${b.getFullYear()}`;
}

// ── Legal token replacement ───────────────────────────────────────────────────

/**
 * Replace {{token}} placeholders in a legal notice template string.
 * Unknown tokens are left as-is so partial templates still render safely.
 *
 * Available tokens:
 *   {{title}}        Gallery title
 *   {{subtitle}}     Gallery subtitle
 *   {{author}}       Author full name
 *   {{authorEmail}}  Author e-mail address
 *   {{year}}         Year extracted from project.date (or current year)
 *   {{date}}         Full date string from project.date
 *   {{location}}     Shooting location
 *   {{description}}  Gallery description
 *
 * @param {string} tpl     - Template string with {{token}} placeholders.
 * @param {object} project - Gallery project config.
 * @returns {string}       - Template with all known tokens replaced.
 */
export function applyLegalTokens(tpl, project) {
  const year = project.date ? project.date.slice(0, 4) : String(new Date().getFullYear());
  const map  = {
    title:         project.title       || '',
    subtitle:      project.subtitle    || '',
    author:        project.author      || '',
    authorEmail:   project.authorEmail || '',
    year,
    date:          project.date        || '',
    location:      project.location    || '',
    description:   project.description || '',
    photographers:     (project.photographers || []).map(n => '\u00a9\u00a0' + n).join(', '),
    photographerNames: (project.photographers || []).filter(n => n !== (project.author || '')).join(', '),
    photographerContacts: (project.photographerDetails || [])
      .filter(p => p.name !== (project.author || ''))
      .map(p => p.email
        ? `<strong>${p.name}</strong><br><a href="mailto:${p.email}">${p.email}</a>`
        : `<strong>${p.name}</strong>`)
      .map(s => `<p>${s}</p>`)
      .join(''),
  };
  // Process {{#if field}}...{{/if}} conditional blocks.
  // Multi-pass so nested conditionals are resolved inside-out.
  let out = tpl;
  let prev;
  do {
    prev = out;
    out = out.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => {
      return (map[key] || '').trim() ? inner : '';
    });
  } while (out !== prev);
  // Then replace remaining {{token}} placeholders.
  return out.replace(/\{\{(\w+)\}\}/g, (_, key) => key in map ? map[key] : `{{${key}}}`);
}

// ── Access / protection helpers ───────────────────────────────────────────────

/**
 * Generate .htaccess and .htpasswd content for basic-auth protection.
 * Uses {SHA} password encoding (Apache mod_authn_file compatible).
 * Returns { htaccess: string, htpasswd: string, username: string, password: string }
 */
export function buildBasicAuth(project, distPath) {
  const username = 'gallery';
  const password = project.password || generatePassword();
  const sha1     = crypto.createHash('sha1').update(password, 'binary').digest('base64');
  const htpasswd = `${username}:{SHA}${sha1}\n`;

  // AuthUserFile needs the absolute server path on the Apache host.
  // GALLERY_APACHE_PATH env var (e.g. /var/www/html/galleries) is set by the
  // server when it knows the deployment root; otherwise fall back to the
  // placeholder so the deployer can replace it manually.
  const apacheBase = (process.env.GALLERY_APACHE_PATH || '').replace(/\/$/, '');
  const htpasswdPath = apacheBase
    ? `${apacheBase}/${path.basename(distPath)}/.htpasswd`
    : '__HTPASSWD_PATH__';

  const htaccess = [
    'AuthType Basic',
    `AuthName "${project.title || 'Gallery'}"`,
    `AuthUserFile ${htpasswdPath}`,
    'Require valid-user',
    '',
    '# Protect all assets (images, JS, JSON)',
    '<FilesMatch "\\.(webp|js|json|zip|md)$">',
    '  Require valid-user',
    '</FilesMatch>',
  ].join('\n') + '\n';

  return { htaccess, htpasswd, username, password };
}

// ── Apache standalone README (V1 — no .htpasswd generation) ──────────────────

/**
 * Generate README-protection.md for Apache standalone deployment.
 * Explains how the deployer must manually create .htpasswd and set the
 * absolute path placeholder in .htaccess.
 *
 * @param {object} project - Gallery project config
 * @returns {string} Markdown content
 */
export function buildApacheReadme(project) {
  const title = project.title || 'Gallery';
  return `# Apache Protection Setup — ${title}

This gallery is protected with HTTP Basic Authentication.

## Files included

- \`.htaccess\` — Apache authentication configuration (contains a path placeholder)
- This \`README-protection.md\` — setup instructions

## Step 1 — Generate .htpasswd

Run the following command on your server (requires Apache utilities):

\`\`\`bash
htpasswd -c /var/www/html/your-gallery-folder/.htpasswd gallery
\`\`\`

Or use an online \`.htpasswd\` generator and upload the file manually.

## Step 2 — Set the absolute path in .htaccess

Open \`.htaccess\` and replace \`__HTPASSWD_ABSOLUTE_PATH__\` with the actual
absolute server path to your \`.htpasswd\` file, for example:

\`\`\`apache
AuthUserFile /var/www/html/your-gallery-folder/.htpasswd
\`\`\`

> **Important:** The path must be the absolute filesystem path on the server,
> not a relative or web path. Check with your hosting provider if unsure.

## Step 3 — Upload

Upload all gallery files (including \`.htaccess\`) to your Apache host.
Make sure hidden files (starting with \`.\`) are included.

## Limitations

- This is Basic Authentication — credentials are sent base64-encoded, not encrypted.
  Use HTTPS to protect them in transit.
- \`.htpasswd\` is NOT included in this export — you must generate it yourself.
- This protection only works on Apache servers with \`mod_authn_file\` enabled.
- For stronger protection, consider a server-side solution.

---
*Generated by GalleryPack*
`;
}

// ── Legal notice (Markdown) ───────────────────────────────────────────────────

const LEGAL_MD_I18N = {
  en: {
    title:   'Copyright Notice',
    intro:   (a, yr) => `The photographs in this folder are original works by **${a}** (© ${yr}).\nThey are protected under Swiss copyright law (CopA/LDA/URG). All rights reserved.\nAny unauthorised use is strictly prohibited.`,
    hWork:   'Work',
    hRights: 'Usage Rights',
    rights:  `Under the **Federal Act on Copyright and Related Rights (CopA)**, all exclusive rights\nto these photographs belong to their author, including:\n\n- The right to decide how their works are used (art. 10 CopA)\n- Automatic recognition of the author as rights holder (art. 2 CopA)\n- Moral rights, inalienable and non-transferable (art. 9 CopA)\n\nFull text of the law: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/en`,
    hPermit: 'Permitted Use',
    permit:  `Access is granted for **private use only** (cf. art. 19 CopA):\n\n- Viewing the photographs\n- Copying or printing them **for personal use only**\n\nAny other use — publication, reproduction, distribution, adaptation, removal of metadata\nor watermarks, AI training datasets, etc. — is **strictly forbidden** without prior\nwritten authorisation from the author.`,
    hContact:'Permission Requests',
    contact: `To use one or more photographs for any other purpose (press, editorial, exhibition,\nwebsite, artistic project, etc.), please contact the author:`,
    closing: 'Thank you for respecting these terms and supporting the protection of artistic works.',
    anon:    'Unknown',
  },
  fr: {
    title:   'Notice de droits d\'auteur',
    intro:   (a, yr) => `Les photographies contenues dans ce dossier sont des œuvres originales de **${a}** (© ${yr}).\nElles sont protégées par la loi suisse sur le droit d'auteur (LDA/CopA/URG). Tous droits réservés.\nToute utilisation non autorisée est strictement interdite.`,
    hWork:   'Œuvre',
    hRights: 'Droits d\'utilisation',
    rights:  `En vertu de la **Loi fédérale sur le droit d'auteur et les droits voisins (LDA)**, tous les droits exclusifs\nsur ces photographies appartiennent à leur auteur, notamment :\n\n- Le droit de décider de l'utilisation de ses œuvres (art. 10 LDA)\n- La reconnaissance automatique de l'auteur comme titulaire des droits (art. 2 LDA)\n- Les droits moraux, inaliénables et incessibles (art. 9 LDA)\n\nTexte intégral de la loi : https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/fr`,
    hPermit: 'Utilisation autorisée',
    permit:  `L'accès est accordé pour un **usage privé uniquement** (cf. art. 19 LDA) :\n\n- Visualisation des photographies\n- Copie ou impression **à usage personnel uniquement**\n\nToute autre utilisation — publication, reproduction, distribution, adaptation, suppression de métadonnées\nou de filigranes, jeux de données pour l'IA, etc. — est **strictement interdite** sans autorisation\nécrite préalable de l'auteur.`,
    hContact:'Demandes d\'autorisation',
    contact: `Pour utiliser une ou plusieurs photographies à d'autres fins (presse, édition, exposition,\nsite web, projet artistique, etc.), veuillez contacter l'auteur :`,
    closing: 'Merci de respecter ces conditions et de soutenir la protection des œuvres artistiques.',
    anon:    'Inconnu',
  },
  de: {
    title:   'Urheberrechtshinweis',
    intro:   (a, yr) => `Die Fotografien in diesem Ordner sind Originalwerke von **${a}** (© ${yr}).\nSie sind durch das schweizerische Urheberrechtsgesetz (URG/CopA/LDA) geschützt. Alle Rechte vorbehalten.\nJede unbefugte Nutzung ist strengstens untersagt.`,
    hWork:   'Werk',
    hRights: 'Nutzungsrechte',
    rights:  `Gemäss dem **Bundesgesetz über das Urheberrecht und verwandte Schutzrechte (URG)** liegen alle ausschliesslichen Rechte\nan diesen Fotografien beim Urheber, einschliesslich:\n\n- Das Recht, über die Verwendung seiner Werke zu entscheiden (Art. 10 URG)\n- Die automatische Anerkennung des Urhebers als Rechteinhaber (Art. 2 URG)\n- Urheberpersönlichkeitsrechte, unveräusserlich und unübertragbar (Art. 9 URG)\n\nVolltext des Gesetzes: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/de`,
    hPermit: 'Erlaubte Nutzung',
    permit:  `Der Zugang wird nur für den **privaten Gebrauch** gewährt (vgl. Art. 19 URG):\n\n- Betrachten der Fotografien\n- Kopieren oder Ausdrucken **ausschliesslich für den persönlichen Gebrauch**\n\nJede andere Verwendung — Veröffentlichung, Vervielfältigung, Verbreitung, Bearbeitung, Entfernung von Metadaten\noder Wasserzeichen, KI-Trainingsdatensätze usw. — ist **strengstens verboten** ohne vorherige\nschriftliche Genehmigung des Urhebers.`,
    hContact:'Genehmigungsanfragen',
    contact: `Um eine oder mehrere Fotografien für andere Zwecke zu verwenden (Presse, Verlag, Ausstellung,\nWebsite, künstlerisches Projekt usw.), wenden Sie sich bitte an den Urheber:`,
    closing: 'Vielen Dank für die Einhaltung dieser Bedingungen und die Unterstützung des Schutzes künstlerischer Werke.',
    anon:    'Unbekannt',
  },
  it: {
    title:   'Nota sul diritto d\'autore',
    intro:   (a, yr) => `Le fotografie contenute in questa cartella sono opere originali di **${a}** (© ${yr}).\nSono protette dalla legislazione svizzera sul diritto d'autore (LDA/CopA/URG). Tutti i diritti riservati.\nQualsiasi utilizzo non autorizzato è vietato.`,
    hWork:   'Opera',
    hRights: 'Diritti d\'uso',
    rights:  `Ai sensi della **Legge federale sul diritto d'autore e sui diritti affini (LDA)**, tutti i diritti esclusivi\nsulle presenti fotografie appartengono al loro autore, inclusi:\n\n- Il diritto di decidere come vengono utilizzate le sue opere (art. 10 LDA)\n- Il riconoscimento automatico dell'autore come titolare dei diritti (art. 10 LDA)\n- I diritti morali, inalienabili e intrasferibili (art. 9 LDA)\n\nTesto integrale della legge: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/it`,
    hPermit: 'Uso consentito',
    permit:  `L'accesso è concesso esclusivamente per **uso privato** (cfr. art. 19 LDA):\n\n- Visualizzazione delle fotografie\n- Copia o stampa **esclusivamente per uso personale**\n\nQualsiasi altro utilizzo — pubblicazione, riproduzione, distribuzione, adattamento, rimozione di metadati\no filigrane, dataset per l'IA, ecc. — è **severamente vietato** senza previa\nautorizzazione scritta dell'autore.`,
    hContact:'Richieste di autorizzazione',
    contact: `Per utilizzare una o più fotografie per qualsiasi altro scopo (stampa, redazione, esposizione,\nsito web, progetto artistico, ecc.), si prega di contattare l'autore:`,
    closing: 'Grazie per aver rispettato questi termini e per sostenere la protezione delle opere artistiche.',
    anon:    'Sconosciuto',
  },
  es: {
    title:   'Aviso de derechos de autor',
    intro:   (a, yr) => `Las fotografías contenidas en esta carpeta son obras originales de **${a}** (© ${yr}).\nEstán protegidas por la legislación suiza sobre derechos de autor (CopA/LDA/URG). Todos los derechos reservados.\nCualquier uso no autorizado está estrictamente prohibido.`,
    hWork:   'Obra',
    hRights: 'Derechos de uso',
    rights:  `De conformidad con la **Ley federal sobre derechos de autor y derechos afines (CopA)**, todos los derechos exclusivos\nsobre estas fotografías pertenecen a su autor, incluyendo:\n\n- El derecho a decidir cómo se utilizan sus obras (art. 10 CopA)\n- El reconocimiento automático del autor como titular de los derechos (art. 2 CopA)\n- Los derechos morales, inalienables e intransferibles (art. 9 CopA)\n\nTexto completo de la ley: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/en`,
    hPermit: 'Uso permitido',
    permit:  `El acceso se concede únicamente para **uso privado** (cf. art. 19 CopA):\n\n- Visualización de las fotografías\n- Copia o impresión **exclusivamente para uso personal**\n\nCualquier otro uso — publicación, reproducción, distribución, adaptación, eliminación de metadatos\no marcas de agua, conjuntos de datos para IA, etc. — está **estrictamente prohibido** sin autorización\nescrita previa del autor.`,
    hContact:'Solicitudes de autorización',
    contact: `Para utilizar una o más fotografías con cualquier otro fin (prensa, editorial, exposición,\nsitio web, proyecto artístico, etc.), póngase en contacto con el autor:`,
    closing: 'Gracias por respeitar estas condiciones y apoyar la protección de las obras artísticas.',
    anon:    'Desconocido',
  },
  pt: {
    title:   'Aviso de direitos de autor',
    intro:   (a, yr) => `As fotografias contidas nesta pasta são obras originais de **${a}** (© ${yr}).\nEstão protegidas pela legislação suíça sobre direitos de autor (CopA/LDA/URG). Todos os direitos reservados.\nQualquer utilização não autorizada é estritamente proibida.`,
    hWork:   'Obra',
    hRights: 'Direitos de utilização',
    rights:  `Nos termos da **Lei federal sobre direitos de autor e direitos conexos (CopA)**, todos os direitos exclusivos\nsobre estas fotografias pertencem ao seu autor, incluindo:\n\n- O direito de decidir como as suas obras são utilizadas (art. 10 CopA)\n- O reconhecimento automático do autor como titular dos direitos (art. 2 CopA)\n- Os direitos morais, inalienáveis e intransmissíveis (art. 9 CopA)\n\nTexto integral da lei: https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/en`,
    hPermit: 'Utilização permitida',
    permit:  `O acesso é concedido apenas para **uso privado** (cf. art. 19 CopA):\n\n- Visualização das fotografias\n- Cópia ou impressão **exclusivamente para uso pessoal**\n\nQualquer outra utilização — publicação, reprodução, distribuição, adaptação, remoção de metadados\nou marcas de água, conjuntos de dados para IA, etc. — é **estritamente proibida** sem autorização\nprévia por escrito do autor.`,
    hContact:'Pedidos de autorização',
    contact: `Para utilizar uma ou mais fotografias para qualquer outro fim (imprensa, editorial, exposição,\nsítio web, projeto artístico, etc.), contacte o autor:`,
    closing: 'Obrigado por respeitar estes termos e por apoiar a proteção das obras artísticas.',
    anon:    'Desconhecido',
  },
};

/**
 * Generate a French Markdown legal notice written to dist/LEGAL.md.
 * This provides a human-readable rights statement alongside the gallery files.
 *
 * @param {object} cfg - Merged project + build config.
 * @returns {string}   - Markdown string.
 */
export function buildLegalNotice(cfg) {
  const p           = cfg.project;
  const locale      = (p.locale || 'en').slice(0, 2).toLowerCase();
  const T           = LEGAL_MD_I18N[locale] || LEGAL_MD_I18N.en;
  const displayName = p.author || (p.photographers && p.photographers.length > 0 ? p.photographers.join(', ') : T.anon);
  const year        = p.date ? p.date.slice(0, 4) : new Date().getFullYear();

  const workLines = [
    p.title    ? `**${p.title}**` : null,
    p.subtitle ? p.subtitle       : null,
    p.location ? p.location       : null,
  ].filter(Boolean);
  const workSection = workLines.length
    ? `## ${T.hWork}\n\n${workLines.join(' · ')}${p.description ? '\n\n' + p.description : ''}\n\n`
    : '';

  return `# ${T.title}

${T.intro(displayName, year)}

${workSection}## ${T.hRights}

${T.rights}

## ${T.hPermit}

${T.permit}

## ${T.hContact}

${T.contact}

**${displayName}**
${p.authorEmail ? p.authorEmail : ''}

---

${T.closing}
`;
}

// ── Site index page ───────────────────────────────────────────────────────────

/**
 * Scan dist/ for all built galleries by reading their photos.json manifests.
 * Returns an array of gallery info objects for every non-private gallery.
 *
 * @returns {{ distName: string, project: object, photoCount: number, firstPhoto: string|null }[]}
 */
export function collectBuiltGalleries() {
  if (!fs.existsSync(DIST_ROOT)) return [];
  return fs.readdirSync(DIST_ROOT)
    .filter(entry => {
      const manifestPath = path.join(DIST_ROOT, entry, 'photos.json');
      return fs.existsSync(manifestPath);
    })
    .map(entry => {
      try {
        const manifestPath = path.join(DIST_ROOT, entry, 'photos.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const project  = manifest.project || {};
        if (project.private) return null;   // skip private galleries

        const photos     = Object.values(manifest.photos || {});
        const photoCount = photos.length;
        const firstPhoto = photos.find(p => p.name)?.name || null;
        const buildMtime = Math.floor(fs.statSync(manifestPath).mtimeMs / 1000);

        // Resolve date: if 'auto' or missing, derive from earliest EXIF date across photos.
        let resolvedDate = (project.date && project.date !== 'auto') ? project.date : null;
        const exifDates = photos.map(p => p.exif?.date).filter(Boolean).sort();
        if (!resolvedDate) {
          resolvedDate = exifDates[0] ? exifDates[0].slice(0, 10) : null;
        }
        const resolvedDateEnd = exifDates.length > 1 ? exifDates[exifDates.length - 1].slice(0, 10) : null;

        // Resolve location: if missing, derive from reverse-geocoded EXIF locations.
        let resolvedLocation = (project.location && project.location !== 'auto') ? project.location : null;
        if (!resolvedLocation) {
          const locs    = photos.map(p => p.exif?.location).filter(Boolean);
          const unique  = [...new Set(locs)];
          if (unique.length === 1) {
            resolvedLocation = unique[0];
          } else if (unique.length > 1) {
            // Multiple distinct locations → try to surface the common country (last segment).
            const countries = [...new Set(unique.map(l => l.split(',').pop().trim()))];
            resolvedLocation = countries.length === 1 ? countries[0] : null;
          }
        }

        return {
          distName:  entry,
          project:   { ...project, date: resolvedDate, dateEnd: resolvedDateEnd, location: resolvedLocation },
          photoCount,
          firstPhoto,
          buildMtime,
        };
      } catch (_) { return null; }
    })
    .filter(Boolean);
}

// ── Gallery HTML generation ───────────────────────────────────────────────────

/**
 * Generate the three output text files that form the gallery front-end:
 *   - index.html  — self-contained page with inlined CSS and local asset references
 *   - data.js     — build-time constants: PHOTOS array + PROJECT object
 *   - gallery.js  — browser-side UI logic (GLightbox, thumbnail strip, EXIF overlay…)
 *
 * The HTML and CSS strings are intentionally kept minified/compact to avoid
 * unnecessary byte overhead in the distributed gallery.
 *
 * @param {object} cfg       - Merged project + build config.
 * @param {Array}  photos    - Processed photo metadata from processPhotos().
 * @param {string} [fontCss] - Inlinable @font-face CSS produced by downloadFonts().
 * @param {boolean} [standalone]
 * @param {object} [customLegal]
 * @param {string} [distName]
 * @param {string} [VERSION]  - GalleryPack version string for footer credit.
 * @returns {{ html: string, dataJs: string, galleryJs: string }}
 */
export function buildHTML(cfg, photos, fontCss = '', standalone = false, customLegal = {}, distName = '', VERSION = '0.0.0') {
  const { project } = cfg;
  // Asset path prefix: standalone galleries embed vendor/fonts locally;
  // shared galleries reference the common dist/vendor/ and dist/fonts/ dirs.
  // For nested dist paths (e.g. project-slug/gallery-slug/) we need the correct
  // number of '../' to reach the shared dist/ root.
  const depth = standalone ? 0 : Math.max(1, (distName || '').split('/').length);
  const vp = standalone ? 'vendor/' : '../'.repeat(depth) + 'vendor/';

  // Lightbox transition settings from build.config.json.
  const VALID_EFFECTS = new Set(['slide', 'fade', 'zoom', 'none']);
  const autoplayCfg = cfg.build.autoplay || {};
  const slideEffect = VALID_EFFECTS.has(autoplayCfg.slideEffect) ? autoplayCfg.slideEffect : 'slide';
  const slideSpeed  = Math.max(50, Math.min(2000, Number(autoplayCfg.slideSpeed) || 400));

  // Mobile srcset sizes — injected into the JS template so the browser gets
  // the correct width descriptor for each tile role.
  const gridMobSmall = cfg.build.gridSizeMobileSmall || 400;
  const gridMobBig   = cfg.build.gridSizeMobileBig   || 600;
  // Font path prefix (mirrors vp but for the fonts/ directory).
  const fp = standalone ? 'fonts/' : '../'.repeat(depth) + 'fonts/';

  // Embed optional custom legal templates as PROJECT properties so the browser
  // can use them directly without any multilingual fallback logic.
  const projectWithLegal = { ...project };
  if (customLegal.html) projectWithLegal.legalHtml = customLegal.html;
  if (customLegal.txt)  projectWithLegal.legalTxt  = customLegal.txt;

  const photosJson  = JSON.stringify(photos.map((p, i) => ({ name: p.name, dlName: p.dlName || p.name, role: BIG_POSITIONS.has(i % 12) ? 'big' : 'small', isDark: p.isDark, exif: p.exif, credit: p.credit || null })));

  // Build a deduplicated list of photographers for the credits section (issue #133)
  const photographerSet = new Map(); // name → true (preserves first-seen order)
  for (const p of photos) {
    if (p.credit && !photographerSet.has(p.credit)) photographerSet.set(p.credit, true);
  }
  const photographers = [...photographerSet.keys()];
  if (photographers.length > 0) projectWithLegal.photographers = photographers;
  const projectJson = JSON.stringify(projectWithLegal);

  // EXIF dates take priority; manual date is the fallback when photos have no EXIF
  const exifDates = photos.map(p => p.exif?.date).filter(Boolean).sort();
  let _dateFrom, _dateTo;
  if (exifDates.length > 0) {
    _dateFrom = exifDates[0].slice(0, 10);
    _dateTo   = exifDates.length > 1 ? exifDates[exifDates.length - 1].slice(0, 10) : null;
  } else {
    _dateFrom = (project.date && project.date !== 'auto') ? project.date : null;
    _dateTo   = null;
  }
  const prisesLe = fmtPrisesLe(_dateFrom, _dateTo);

  // Preload links for the first N grid thumbnails — browser fetches them
  // immediately during HTML parsing, before any JS executes (best LCP).
  // imagesrcset/imagesizes mirror the srcset/sizes on the <img> so browsers
  // select the right source during preload (mobile gets grid-sm, desktop gets grid).
  const PRELOAD_COUNT = (cfg.build && cfg.build.preloadCount) || 6;
  const preloadLinks = photos.slice(0, PRELOAD_COUNT).map((p, i) => {
    const isBig    = BIG_POSITIONS.has(i % 12);
    const mobSz    = isBig ? gridMobBig : gridMobSmall;
    const deskSz   = isBig ? 1400 : 800;
    const srcset   = `img/grid-sm/${p.name}.webp ${mobSz}w, img/grid/${p.name}.webp ${deskSz}w`;
    const sizes    = isBig ? '(max-width: 767px) 66vw, 1400px' : '(max-width: 767px) 33vw, 800px';
    const priority = i === 0 ? ' fetchpriority="high"' : '';
    return `<link rel="preload" as="image" href="img/grid/${p.name}.webp" imagesrcset="${srcset}" imagesizes="${sizes}"${priority}>`;
  }).join('\n');

  const htmlLang = (project.locale || 'en').slice(0, 2).toLowerCase();

  // "Generated by" label, localized to match the gallery's declared UI language.
  const CREDIT_I18N = {
    en: 'Generated by', fr: 'G\u00e9n\u00e9r\u00e9 par', de: 'Erstellt mit',
    it: 'Generato con',  es: 'Generado con',              pt: 'Gerado com',
  };
  const generatedBy = CREDIT_I18N[htmlLang] || CREDIT_I18N.en;

  const isStandalone = Boolean(cfg.project.standalone);
  const backLink = isStandalone ? '' : `<a href="../" class="bar-back" title="Back to gallery list">←</a>`;

  const html = `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>${escHtml(project.title)}</title>
${project.description ? `<meta name="description" content="${escHtml(project.description)}">` : ''}
<script>const _p=location.pathname;const _s=_p.slice(_p.lastIndexOf('/')+1);if(!_p.endsWith('/')&&_s.indexOf('.')<0)location.replace(_p+'/'+location.search+location.hash)</script>
${preloadLinks}
<link rel="preload" as="font" href="${fp}poppins-400.woff2" type="font/woff2" crossorigin>
<link rel="preload" as="font" href="${fp}poppins-600.woff2" type="font/woff2" crossorigin>
<link rel="preload" as="font" href="${fp}poppins-500.woff2" type="font/woff2" crossorigin>
<link rel="preload" as="style" href="${vp}glightbox.min.css" onload="this.rel='stylesheet'">
<link rel="preload" as="style" href="${vp}tiny-slider.css" onload="this.rel='stylesheet'">
<noscript><link rel="stylesheet" href="${vp}glightbox.min.css"><link rel="stylesheet" href="${vp}tiny-slider.css"></noscript>
<style>
${fontCss}
/* ── Reset ──────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

:root{
  --bg:#1c1c1c;
  --ink:#e8e4dd;
  --muted:#706860;
  --accent:#c8a96e;
  --gap:4px;
  --bar:56px;
}

html,body{height:100%;background:var(--bg);color:var(--ink);overscroll-behavior:none}

/* ── Toolbar ────────────────────────────────────────── */
.bar{
  position:fixed;top:0;left:0;right:0;height:var(--bar);
  display:flex;align-items:center;justify-content:space-between;
  padding:0 22px;
  background:rgba(0,0,0,.85);
  backdrop-filter:blur(18px) saturate(120%);
  -webkit-backdrop-filter:blur(18px) saturate(120%);
  border-bottom:1px solid rgba(255,255,255,.07);
  z-index:90;user-select:none
}
.bar-title{
  font-family:'Poppins',sans-serif;
  font-size:15px;font-weight:600;letter-spacing:-.01em
}
.bar-meta{
  font-family:'Poppins',sans-serif;
  font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted);margin-top:2px
}
.bar-right{display:flex;align-items:center;gap:16px}
.bar-count{
  font-family:'Poppins',sans-serif;font-size:11px;color:var(--muted)
}
.bar-back{color:rgba(255,255,255,.55);text-decoration:none;font-size:18px;line-height:1;padding:0 12px 0 0;flex-shrink:0;transition:color .2s;display:flex;align-items:center}
.bar-back:hover{color:rgba(255,255,255,.9)}
#dl-all-btn{
  display:inline-flex;align-items:center;gap:6px;
  font-family:'Poppins',sans-serif;font-size:11px;font-weight:400;
  color:rgba(255,255,255,.35);
  background:none;border:1px solid rgba(255,255,255,.12);
  border-radius:4px;padding:5px 10px;cursor:pointer;
  transition:color .15s,border-color .15s;white-space:nowrap
}
#dl-all-btn:hover{color:rgba(255,255,255,.75);border-color:rgba(255,255,255,.3)}
#dl-all-btn:disabled{opacity:.4;cursor:wait}

/* ── Grid ───────────────────────────────────────────── */
.wrap{padding-top:var(--bar)}
.grid{
  display:grid;
  grid-template-columns:repeat(3,1fr);
  grid-auto-rows:calc((min(100vw, 1320px) - 2 * var(--gap)) / 3);
  gap:var(--gap)
}

.tile{
  position:relative;overflow:hidden;
  background:#111;cursor:pointer;
  -webkit-tap-highlight-color:transparent
}

.tile img{
  width:100%;height:100%;
  object-fit:cover;display:block;
  transition:transform .4s cubic-bezier(.25,.46,.45,.94);
  will-change:transform
}
.tile:hover img{transform:scale(1.04)}
.tile:active img{transform:scale(.97)}

/* Skeleton shimmer — GPU-composited via transform (no background-position) */
.tile::before{
  content:'';position:absolute;inset:0;z-index:1;
  background:#111;
  transition:opacity .3s
}
.tile::after{
  content:'';position:absolute;inset:0;z-index:2;
  background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.06) 50%,transparent 100%);
  transform:translateX(-100%);
  animation:shim 1.6s infinite;
  transition:opacity .3s;pointer-events:none
}
.tile.ready::before,.tile.ready::after{opacity:0;pointer-events:none}
@keyframes shim{to{transform:translateX(200%)}}

/* Index numérique au survol */
.tile-n{
  position:absolute;bottom:6px;right:8px;z-index:3;
  font-family:'Poppins',sans-serif;font-size:10px;font-weight:500;
  color:rgba(255,255,255,.55);letter-spacing:.04em;
  text-shadow:0 1px 3px rgba(0,0,0,.4);
  opacity:0;transition:opacity .2s
}
.tile:hover .tile-n{opacity:1}

/* ── GLightbox transition speed ─────────────────────── */
/* GLightbox applies the .animated class during slide transitions;
   overriding animation-duration here controls all effect speeds. */
.glightbox-container .gslide.animated{animation-duration:${slideSpeed}ms}

/* ── GLightbox overrides ────────────────────────────── */
/* Description panel = panneau EXIF + download */
.glightbox-clean .gdesc-inner{
  padding:14px 18px 18px;
  background:rgba(12,10,8,.88);
  backdrop-filter:blur(20px)
}
.glightbox-clean .gslide-description{
  background:transparent
}

/* Description custom */
.gl-desc{
  display:flex;align-items:center;gap:10px;
  font-family:'Poppins',sans-serif
}
.gl-proj{
  flex:1;
  font-family:'Poppins',sans-serif;
  font-size:11px;color:rgba(255,255,255,.35);line-height:1.6
}
.gl-proj strong{color:rgba(255,255,255,.55);font-weight:500}

.gl-dl{
  display:inline-flex;align-items:center;gap:6px;
  font-family:'Poppins',sans-serif;
  font-size:12px;font-weight:500;
  color:rgba(255,255,255,.7);
  text-decoration:none;
  border:1px solid rgba(255,255,255,.18);
  border-radius:4px;padding:6px 14px;
  transition:background .15s,color .15s;
  white-space:nowrap;flex-shrink:0
}
.gl-dl:hover{background:rgba(255,255,255,.1);color:#fff}
.gl-dl svg{flex-shrink:0}

/* EXIF (i) button — fixed bottom-right overlay */
#gl-info-btn{
  position:fixed;z-index:1000000;
  bottom:76px;right:24px;
  width:28px;height:28px;border-radius:50%;
  border:1px solid rgba(255,255,255,.25);
  background:transparent;
  color:rgba(255,255,255,.65);
  font-family:'Poppins',sans-serif;
  font-size:13px;font-style:italic;font-weight:500;
  cursor:pointer;
  display:none;align-items:center;justify-content:center;
  transition:background .15s,color .15s,border-color .15s,opacity .4s
}
/* GLightbox adds .glightbox-open on <body> → drives button visibility */
body.glightbox-open #gl-info-btn{display:flex}
#gl-info-btn:hover,#gl-info-btn.active{
  background:rgba(255,255,255,.12);
  color:#fff;border-color:rgba(255,255,255,.5)
}

/* Fullscreen button (all screen sizes — JS removes it if API unavailable) */
#gl-fs-btn{
  position:fixed;z-index:1000000;
  top:70px;right:16px;
  width:36px;height:36px;
  display:none;align-items:center;justify-content:center;
  background:rgba(0,0,0,.5);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,.18);
  border-radius:6px;
  color:rgba(255,255,255,.7);
  cursor:pointer;
  transition:background .15s,color .15s,opacity .4s
}
#gl-fs-btn:hover{background:rgba(255,255,255,.15);color:#fff}
body.glightbox-open #gl-fs-btn{display:inline-flex}
body.sw-playing #gl-fs-btn{display:none!important}

/* Slideshow interval selector */
#sw-interval{
  height:32px;padding:0 6px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);
  border-radius:6px;
  color:rgba(255,255,255,.55);
  font-size:11px;font-family:'Poppins',sans-serif;
  cursor:pointer;
  appearance:none;-webkit-appearance:none;
  text-align:center;
  transition:background .15s,color .15s,opacity .4s
}
#sw-interval:hover{background:rgba(255,255,255,.1);color:#fff}
#sw-interval option{background:#2a2520;color:#e8e4dd}

/* Slideshow button (toolbar) */
#slideshow-btn{
  display:flex;align-items:center;gap:6px;
  padding:0 10px;height:32px;
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);
  border-radius:6px;
  color:rgba(255,255,255,.65);
  font-size:11px;font-family:'Poppins',sans-serif;font-weight:500;
  cursor:pointer;
  transition:background .15s,color .15s,opacity .4s;
  white-space:nowrap
}
#slideshow-btn:hover{background:rgba(255,255,255,.12);color:#fff}
#slideshow-btn.active{
  background:rgba(200,169,110,.15);
  border-color:rgba(200,169,110,.35);
  color:var(--accent)
}
/* Slideshow pause/resume button inside the lightbox overlay */
#gl-sw-btn{
  position:fixed;z-index:1000000;
  top:14px;right:60px;
  width:36px;height:36px;
  display:none;align-items:center;justify-content:center;
  background:rgba(0,0,0,.5);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid rgba(200,169,110,.35);
  border-radius:6px;
  color:var(--accent);
  cursor:pointer;
  transition:background .15s,color .15s,opacity .4s
}
#gl-sw-btn:hover{background:rgba(200,169,110,.15)}


/* Per-photo download button (lightbox overlay, bottom-right) */
#gl-dl-btn{
  position:fixed;z-index:1000000;
  bottom:76px;right:60px;
  width:28px;height:28px;
  display:none;align-items:center;justify-content:center;
  color:rgba(255,255,255,.65);text-decoration:none;
  background:transparent;
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  border:1px solid rgba(255,255,255,.25);
  border-radius:50%;
  transition:background .15s,color .15s,opacity .4s
}
body.glightbox-open #gl-dl-btn{display:flex}
#gl-dl-btn:hover{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.5)}

/* EXIF metadata overlay (photo bottom-left) */
#gl-exif-overlay{
  position:fixed;z-index:1000000;
  bottom:160px;left:24px;
  width:min(320px, calc(100vw - 48px));
  background:rgba(0,0,0,.78);
  backdrop-filter:blur(24px) saturate(180%);
  -webkit-backdrop-filter:blur(24px) saturate(180%);
  border:1px solid rgba(255,255,255,.1);
  border-radius:8px;
  padding:16px 20px;
  font-family:'Poppins',sans-serif
}

.gl-exif-title{
  font-size:10px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--accent);margin-bottom:8px
}
.gl-exif-rows{display:flex;flex-direction:column;gap:3px}
.gl-exif-row{
  display:flex;justify-content:space-between;gap:8px;
  font-size:11px;padding:3px 0;
  border-bottom:1px solid rgba(255,255,255,.06)
}
.gl-exif-row:last-child{border:none}
.gl-exif-k{color:rgba(255,255,255,.4);white-space:nowrap;flex-shrink:0}
.gl-exif-v{color:rgba(255,255,255,.8);text-align:right;display:flex;align-items:center;justify-content:flex-end;gap:4px}
.gl-exif-maps{color:rgba(255,255,255,.45);line-height:0;flex-shrink:0;transition:color .2s}
.gl-exif-maps:hover{color:rgba(255,255,255,.9)}
.gl-none{color:rgba(255,255,255,.3);font-size:11px}

/* ── tiny-slider thumbnail strip ────────────────────── */
/* Le strip est injecté dans le footer de GLightbox */
#gl-thumbs{
  position:fixed;bottom:0;left:0;right:0;
  height:70px;z-index:9999;
  background:rgba(0,0,0,.72);
  backdrop-filter:blur(10px);
  border-top:1px solid rgba(255,255,255,.07);
  overflow:hidden
}
#gl-thumbs-inner{height:70px}

.tns-thumb-item{
  height:70px;cursor:pointer;
  outline:none;
  opacity:.45;
  transition:opacity .2s
}
.tns-thumb-item img{
  width:100%;height:100%;
  object-fit:cover;display:block
}
.tns-thumb-item.active,
.tns-thumb-item:hover{opacity:1}
.tns-thumb-item.active{
  box-shadow:inset 0 0 0 2px rgba(184,150,80,.9)
}

/* Masquer les contrôles tiny-slider natifs */
.tns-controls{display:none}
.tns-nav{display:none}

/* ── GLightbox : photo plein écran ──────────────────── */
.gslide-media{
  flex:1 1 auto !important;
  max-height:calc(100vh - 70px) !important
}
.gslide-image img{
  max-height:calc(100vh - 70px) !important;
  width:auto !important;max-width:100vw !important
}
/* ── Fullscreen: image fills the entire screen, no gaps ─────────────
   :fullscreen targets the standard API; :-webkit-full-screen covers
   older Android/Chrome.  dvh (dynamic viewport height) accounts for
   Android's gesture bar which 100vh sometimes ignores. */
:fullscreen .gslide-media,
:-webkit-full-screen .gslide-media{
  max-height:100vh !important;
  max-height:100dvh !important;
  box-shadow:none !important;
  margin:0 !important
}
:fullscreen .gslide-image img,
:-webkit-full-screen .gslide-image img{
  max-height:100vh !important;
  max-height:100dvh !important;
  max-width:100vw !important;
  width:auto !important;
  height:auto !important;
  object-fit:contain !important
}
:fullscreen .ginner-container,
:-webkit-full-screen .ginner-container{
  width:100vw !important;
  height:100vh !important;
  height:100dvh !important;
  max-width:100vw !important;
  padding:0 !important;
  display:flex !important;
  align-items:center !important;
  justify-content:center !important
}
/* Landscape: explicitly swap constraints so height is the binding dimension */
@media (orientation:landscape){
  :fullscreen .gslide-image img,
  :-webkit-full-screen .gslide-image img{
    max-height:100vh !important;
    max-height:100dvh !important;
    max-width:100vw !important;
    width:auto !important;
    height:100vh !important;
    height:100dvh !important
  }
  :fullscreen .gslide-media,
  :-webkit-full-screen .gslide-media{
    width:100vw !important;
    height:100vh !important;
    height:100dvh !important;
    max-height:100dvh !important;
    display:flex !important;
    align-items:center !important;
    justify-content:center !important
  }
}
/* Panel description GLightbox masqué — on gère tout via overlays fixes */
.glightbox-clean .gslide-description{display:none !important}

/* Title overlay — bottom-left, visible on hover, always readable */
#gl-title{
  position:fixed;z-index:1000001;
  bottom:76px;left:24px;
  font-family:'Poppins',sans-serif;
  font-size:11px;font-weight:300;letter-spacing:.06em;
  color:rgba(255,255,255,.82);
  background:rgba(0,0,0,.38);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  border:1px solid rgba(255,255,255,.10);
  border-radius:4px;
  padding:3px 9px;
  opacity:0;
  transition:opacity .35s;
  pointer-events:none;
  max-width:calc(100vw - 140px);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis
}
body.glightbox-open:hover #gl-title{opacity:1}
/* During active slideshow: title visible (not just on hover) */
body.glightbox-open.sw-playing #gl-title{opacity:1}

/* ── Slideshow idle: auto-hide all controls ──────────── */
#gl-thumbs{transition:opacity .4s}
/* Fade out overlays + arrows + thumbnail strip + cursor after inactivity */
body.sw-idle #gl-sw-btn,
body.sw-idle #gl-fs-btn,
body.sw-idle #gl-dl-btn,
body.sw-idle #gl-info-btn,
body.sw-idle #gl-title,
body.sw-idle #gl-thumbs,
body.sw-idle #sw-interval,
body.sw-idle #slideshow-btn,
body.sw-idle .gnext,
body.sw-idle .gprev{opacity:0 !important;pointer-events:none !important}
body.sw-idle.glightbox-open{cursor:none}

/* ── Footer mentions légales ─────────────────────── */
.gallery-footer{
  text-align:center;padding:28px 0 44px;
}
#legal-btn{
  font-family:'Poppins',sans-serif;
  font-size:10px;font-weight:400;
  color:rgba(255,255,255,.2);
  background:none;border:none;cursor:pointer;
  letter-spacing:.12em;text-transform:uppercase;
  transition:color .2s;padding:0
}
#legal-btn:hover{color:rgba(255,255,255,.5)}
.footer-sep{
  font-family:'Poppins',sans-serif;
  font-size:10px;color:rgba(255,255,255,.1);
  margin:0 10px
}
.footer-credit{
  font-family:'Poppins',sans-serif;
  font-size:10px;font-weight:400;
  color:rgba(255,255,255,.15);
  text-decoration:none;
  letter-spacing:.12em;text-transform:uppercase;
  transition:color .2s
}
.footer-credit:hover{color:rgba(255,255,255,.45)}

/* ── Max-width container ─────────────────────────── */
.wrap-inner{max-width:1320px;margin:0 auto}

/* ── Hero section ────────────────────────────────── */
.gallery-hero{
  max-width:1320px;margin:0 auto;
  padding:52px 32px 40px;
  text-align:center;
}
.hero-title{
  font-family:'Poppins',sans-serif;
  font-size:clamp(26px,4.5vw,52px);font-weight:600;
  color:var(--ink);margin:0 0 14px;
  letter-spacing:-.02em;line-height:1.15;
}
.hero-authors{
  font-family:'Poppins',sans-serif;
  font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--muted);margin:0 auto 32px;
  text-align:center;max-width:1320px;padding:0 32px;display:block;
}
.hero-sep{margin:0 8px;opacity:.4}
.hero-dates{margin-left:10px;opacity:.7}
.hero-desc{
  font-family:'Poppins',sans-serif;
  max-width:700px;margin:0 auto;
  font-size:14px;font-weight:300;
  color:rgba(232,228,221,.65);line-height:1.85;
  text-align:left;
}
.hero-desc p{margin:0 0 14px}
.hero-desc p:last-child{margin-bottom:0}
.hero-desc h1,.hero-desc h2,.hero-desc h3{
  font-family:'Poppins',sans-serif;font-weight:600;
  color:rgba(232,228,221,.9);margin:20px 0 8px;letter-spacing:-.01em;
}
.hero-desc h2{font-size:15px}
.hero-desc h3{font-size:13px}
.hero-desc ul,.hero-desc ol{padding-left:20px;margin:0 0 14px}
.hero-desc li{margin-bottom:4px}
.hero-desc a{color:var(--accent);text-decoration:none}
.hero-desc a:hover{text-decoration:underline}
.hero-desc strong{color:rgba(232,228,221,.85);font-weight:500}
.hero-desc em{font-style:italic}
.hero-divider{
  width:40px;height:1px;background:rgba(255,255,255,.1);
  margin:0 auto 40px;
}

/* ── Photo credits section (issue #133) ─────────── */
#photo-credits{
  text-align:center;padding:32px 24px 0;max-width:640px;margin:0 auto;
}
.credits-title{
  font-family:'Poppins',sans-serif;font-size:10px;font-weight:500;
  color:rgba(255,255,255,.2);text-transform:uppercase;letter-spacing:.12em;
  margin:0 0 14px;
}
.credits-list{
  list-style:none;padding:0;margin:0 0 10px;
  display:flex;flex-wrap:wrap;justify-content:center;gap:6px 18px;
}
.credits-list li{
  font-family:'Poppins',sans-serif;font-size:11px;font-weight:300;
  color:rgba(255,255,255,.35);
}
.credits-notice{
  font-family:'Poppins',sans-serif;font-size:9px;font-weight:300;
  color:rgba(255,255,255,.15);letter-spacing:.05em;margin:0;
}
/* Per-photo credit badge shown inside grid tile (hover) */
.tile-credit{
  position:absolute;bottom:6px;left:6px;right:6px;
  font-family:'Poppins',sans-serif;font-size:9px;font-weight:400;
  color:rgba(255,255,255,.7);background:rgba(0,0,0,.45);
  padding:2px 6px;border-radius:3px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  opacity:0;transition:opacity .2s;pointer-events:none;
}
.tile:hover .tile-credit{opacity:1}

/* ── Modale mentions légales ─────────────────────── */
#legal-overlay{
  position:fixed;inset:0;z-index:200000;
  background:rgba(0,0,0,.8);
  backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
  display:none;align-items:center;justify-content:center;
  padding:20px
}
#legal-box{
  background:#0d0d0d;
  border:1px solid rgba(255,255,255,.1);
  border-radius:10px;
  max-width:620px;width:100%;
  max-height:82vh;overflow-y:auto;
  padding:32px 36px 36px;
  position:relative;
  font-family:'Poppins',sans-serif
}
#legal-close{
  position:absolute;top:14px;right:16px;
  background:none;border:none;
  color:rgba(255,255,255,.35);
  font-size:22px;line-height:1;cursor:pointer;padding:4px 6px;
  font-family:'Poppins',sans-serif;
  transition:color .15s
}
#legal-close:hover{color:#fff}
#legal-body h1{font-size:14px;font-weight:600;margin:0 0 18px;color:#fff;letter-spacing:.02em}
#legal-body h2{font-size:10px;font-weight:500;margin:22px 0 8px;color:rgba(255,255,255,.5);text-transform:uppercase;letter-spacing:.1em}
#legal-body p{font-size:12px;font-weight:300;color:rgba(255,255,255,.55);line-height:1.85;margin:0 0 10px}
#legal-body ul{padding-left:18px;margin:0 0 12px}
#legal-body li{font-size:12px;font-weight:300;color:rgba(255,255,255,.55);line-height:1.85;margin:0 0 4px}
#legal-body strong{color:rgba(255,255,255,.8);font-weight:500}
#legal-body a{color:rgba(200,169,110,.8);text-decoration:none}
#legal-body a:hover{text-decoration:underline}
#legal-body hr{border:none;border-top:1px solid rgba(255,255,255,.08);margin:22px 0}
</style>
</head>
<body>

<div class="bar">
${backLink}
  <div>
    <div class="bar-title" id="bTitle"></div>
    <div class="bar-meta"  id="bMeta"></div>
  </div>
  <div class="bar-right">
    <span class="bar-count" id="bCount"></span>
    <select id="sw-interval" title="Slideshow interval" aria-label="Slideshow interval">
${[2,3,5,8,10].map(s => {
  const def = (project.autoplay && project.autoplay.slideshowInterval) || 3;
  return `      <option value="${s}"${s === def ? ' selected' : ''}>${s}s</option>`;
}).join('\n')}
    </select>
    <button id="slideshow-btn" title="Start slideshow" aria-label="Start slideshow">
      <svg id="sw-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" stroke="none">
        <polygon points="3,1 15,8 3,15"/>
      </svg>
    </button>
    <button id="dl-all-btn" title="Télécharger tous les originaux">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 2v8M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"/>
      </svg>
      <span id="dl-all-label">Download all</span>
    </button>
  </div>
</div>


<main class="wrap">
  ${(project.descriptionHtml || photographers.length > 0) ? `
  <header class="gallery-hero">
    <h1 class="hero-title">${escHtml(project.title || '')}</h1>
    ${project.descriptionHtml ? `<div class="hero-desc">${project.descriptionHtml}</div>` : ''}
  </header>
  <div class="hero-divider"></div>` : ''}
  ${photographers.length > 0 ? `<p class="hero-authors">Photos de ${photographers.map((n, i) => `${i > 0 ? '<span class="hero-sep">·</span>' : ''}${escHtml(n)}`).join('')}${prisesLe ? ` <span class="hero-dates">${escHtml(prisesLe)}</span>` : ''}</p>` : ''}
  <div class="wrap-inner">
    <div class="grid" id="grid"></div>
  </div>
  ${photographers.length > 0 ? `
  <section id="photo-credits" aria-label="Photo credits">
    <h2 class="credits-title">Photo credits</h2>
    <ul class="credits-list">
      ${photographers.map(name => `<li>© ${name}</li>`).join('\n      ')}
    </ul>
    <p class="credits-notice">All photos © their respective authors. Reproduction prohibited without written consent.</p>
  </section>` : ''}
  <footer class="gallery-footer">
    <button id="legal-btn">Legal notice</button>
    <span class="footer-sep">·</span>
    <a class="footer-credit" href="https://github.com/pvollenweider/gallerypack" target="_blank" rel="noopener">${generatedBy} GalleryPack v${VERSION}</a>
  </footer>
</main>

<!-- Thumbnail strip (GLightbox footer) -->
<div id="gl-thumbs" style="display:none">
  <div id="gl-thumbs-inner"></div>
</div>

<!-- GLightbox items (liens cachés) -->
<div id="gl-items" style="display:none"></div>

<!-- Title overlay (bottom-left) -->
<div id="gl-title"></div>

<!-- Modale mentions légales -->
<div id="legal-overlay">
  <div id="legal-box">
    <button id="legal-close" title="Fermer">×</button>
    <div id="legal-body"></div>
  </div>
</div>

<!-- Lightbox overlays (visibility driven by CSS / JS) -->
<button id="gl-sw-btn" title="Pause slideshow" aria-label="Pause slideshow">
  <svg id="gl-sw-icon" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" stroke="none">
    <rect x="2" y="1" width="4" height="14"/><rect x="10" y="1" width="4" height="14"/>
  </svg>
</button>
<button id="gl-fs-btn" title="Fullscreen" aria-label="Fullscreen">
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 6V2h4M10 2h4v4M15 10v4h-4M6 14H2v-4"/>
  </svg>
</button>
<button id="gl-dl-btn" title="Download photo" aria-label="Download photo">
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 2v8M5 7l3 3 3-3M2 12v1a1 1 0 001 1h10a1 1 0 001-1v-1"/>
  </svg>
</button>
<button id="gl-info-btn" title="EXIF Metadata"><i>i</i></button>
<div id="gl-exif-overlay" style="display:none">
  <div id="gl-exif-inner"></div>
</div>

<script src="${vp}glightbox.min.js"></script>
<script src="data.js"></script>
<script src="gallery.js"></script>
</body>
</html>`;

  // data.js — injected at build time; contains PHOTOS array and PROJECT object.
  const dataJs = `/* generated — do not edit manually */
const PHOTOS  = ${photosJson};
const PROJECT = ${projectJson};
`;

  // gallery.js — browser-side UI logic; uses PHOTOS and PROJECT from data.js.
  const galleryJs = `/* ── Initialise toolbar (title, metadata, photo count) ── */
function fmtDateRange(from, to) {
  if (!from) return '';
  const a    = new Date(from + 'T12:00:00'), b = to ? new Date(to + 'T12:00:00') : a;
  const diff = Math.round((b - a) / 86400000);
  const loc  = PROJECT.locale || 'fr';
  const dNum = d => d.getDate();
  const mLong = d => d.toLocaleDateString(loc, {month:'long'});
  const y = a.getFullYear();
  const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  // 1 day: full date
  if (diff === 0) return a.toLocaleDateString(loc, {day:'numeric', month:'long', year:'numeric'});
  // 2 days: "les X et Y mois année"
  if (diff === 1 && sameMonth) {
    const sep = loc.startsWith('fr') ? 'Les' : 'The';
    return \`\${sep} \${dNum(a)} et \${dNum(b)} \${mLong(a)} \${y}\`;
  }
  // 3–5 days: "Du X au Y mois année"
  if (diff <= 4) {
    const pre = loc.startsWith('fr') ? 'Du' : '';
    const mid = loc.startsWith('fr') ? 'au' : '–';
    if (sameMonth) return \`\${pre} \${dNum(a)} \${mid} \${dNum(b)} \${mLong(a)} \${y}\`.trim();
    return \`\${pre} \${dNum(a)} \${mLong(a)} \${mid} \${dNum(b)} \${mLong(b)} \${y}\`.trim();
  }
  // ≥6 days: month [– month] year
  if (sameMonth) return a.toLocaleDateString(loc, {month:'long', year:'numeric'});
  if (a.getFullYear() === b.getFullYear())
    return mLong(a) + ' \u2013 ' + b.toLocaleDateString(loc, {month:'long', year:'numeric'});
  return a.toLocaleDateString(loc, {month:'short', year:'numeric'}) + ' \u2013 ' + b.toLocaleDateString(loc, {month:'short', year:'numeric'});
}
const dateFmt = fmtDateRange(PROJECT.date, PROJECT.dateEnd);
document.getElementById('bTitle').textContent = PROJECT.title || '';
const bMetaParts = [PROJECT.location, dateFmt];
if (PROJECT.photographers && PROJECT.photographers.length > 0)
  bMetaParts.push(PROJECT.photographers.join(' \u00b7 '));
document.getElementById('bMeta').textContent  = bMetaParts.filter(Boolean).join(' \u00b7 ');
document.getElementById('bCount').textContent = PHOTOS.length + ' photo' + (PHOTOS.length>1?'s':'');

/* ── EXIF localisation strings ──────────────────────── */
const EXIF_I18N = {
  fr:{ label:'Métadonnées', camera:'Appareil',    lens:'Objectif',   date:'Date prise de vue', location:'Lieu',    shutter:'Vitesse',   aperture:'Ouverture', iso:'Sensibilité', focal:'Focale',      focal35:'Éq. 35mm',    width:'Largeur px',  height:'Hauteur px',  fileSize:'Taille fichier', copyright:'Copyright', originalFile:'Fichier source', noData:'Aucune donnée EXIF' },
  en:{ label:'Metadata',    camera:'Camera',      lens:'Lens',       date:'Date taken',        location:'Location', shutter:'Shutter',   aperture:'Aperture',  iso:'ISO',         focal:'Focal',       focal35:'35mm equiv.',  width:'Width px',    height:'Height px',   fileSize:'File size',      copyright:'Copyright', originalFile:'Source file',    noData:'No EXIF data' },
  de:{ label:'Metadaten',   camera:'Kamera',      lens:'Objektiv',   date:'Aufnahmedatum',     location:'Ort',      shutter:'Belichtung',aperture:'Blende',    iso:'ISO',         focal:'Brennweite',  focal35:'KB-Äquiv.',    width:'Breite px',   height:'Höhe px',     fileSize:'Dateigrösse',    copyright:'Copyright', originalFile:'Quelldatei',     noData:'Keine EXIF-Daten' },
  es:{ label:'Metadatos',   camera:'Cámara',      lens:'Objetivo',   date:'Fecha de toma',     location:'Lugar',    shutter:'Velocidad', aperture:'Apertura',  iso:'ISO',         focal:'Focal',       focal35:'Equiv. 35mm',  width:'Anchura px',  height:'Altura px',   fileSize:'Tamaño archivo', copyright:'Copyright', originalFile:'Archivo origen', noData:'Sin datos EXIF' },
  it:{ label:'Metadati',    camera:'Fotocamera',  lens:'Obiettivo',  date:'Data scatto',       location:'Luogo',    shutter:'Otturatore',aperture:'Apertura',  iso:'ISO',         focal:'Focale',      focal35:'Equiv. 35mm',  width:'Larghezza px',height:'Altezza px',  fileSize:'Dimensione',     copyright:'Copyright', originalFile:'File sorgente',  noData:'Nessun dato EXIF' },
  pt:{ label:'Metadados',   camera:'Câmera',      lens:'Lente',      date:'Data da foto',      location:'Local',    shutter:'Velocidade',aperture:'Abertura',  iso:'ISO',         focal:'Focal',       focal35:'Equiv. 35mm',  width:'Largura px',  height:'Altura px',   fileSize:'Tamanho',        copyright:'Copyright', originalFile:'Ficheiro fonte', noData:'Sem dados EXIF' },
};
const EXIF_KEYS = ['camera','lens','date','location','shutter','aperture','iso','focal','focal35','width','height','fileSize','copyright','originalFile'];
// Locale priority: forced in config → browser preference → English fallback.
const lang = (PROJECT.locale || navigator.language || 'en').slice(0,2).toLowerCase();
const L = EXIF_I18N[lang] || EXIF_I18N.en;

function exifHTML(exif) {
  // Merge EXIF location (GPS) with project location as fallback.
  const merged = { ...exif };
  if (merged.location === undefined && PROJECT.location) merged.location = PROJECT.location;

  const rows = EXIF_KEYS
    .filter(k => merged[k] !== undefined)
    .map(k => {
      let v = merged[k];
      // Format date taken as a human-readable local string.
      if (k === 'date') { try { v = new Date(v).toLocaleString(); } catch(_){} }
      // location: resolved to a plain string at build time.
      // GPS object fallback: stale manifest — format as decimal coords.
      if (k === 'location' && v && typeof v === 'object') {
        const { lat, lng } = v;
        v = \`\${Math.abs(lat).toFixed(4)}°\${lat >= 0 ? 'N' : 'S'}, \${Math.abs(lng).toFixed(4)}°\${lng >= 0 ? 'E' : 'W'}\`;
      }
      // If GPS coords are available, append a Google Maps link next to the label.
      if (k === 'location' && merged.gps && typeof merged.gps === 'object') {
        const { lat, lng } = merged.gps;
        const mapsUrl = \`https://www.google.com/maps?q=\${lat.toFixed(6)},\${lng.toFixed(6)}\`;
        v = \`\${v}\u2002<a class="gl-exif-maps" href="\${mapsUrl}" target="_blank" rel="noopener" title="Voir sur Google Maps"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2C4.24 2 2 4.24 2 7c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z"/><circle cx="7" cy="7" r="1.5"/></svg></a>\`;
      }
      return \`<div class="gl-exif-row"><span class="gl-exif-k">\${L[k]}</span><span class="gl-exif-v">\${v}</span></div>\`;
    });
  if (!rows.length) return \`<span class="gl-none">\${L.noData}</span>\`;
  return \`<div class="gl-exif-title">\${L.label}</div><div class="gl-exif-rows">\${rows.join('')}</div>\`;
}

/* ── Title overlay ───────────────────────────────────── */
/* Pill with frosted-glass backdrop — always legible regardless of what is
   behind it (photo or black letterbox bars). */
const glTitle = document.getElementById('gl-title');
function updateTitleColor(idx) {
  const exif = PHOTOS[idx]?.exif || {};
  const photoDate = exif.date
    ? new Date(exif.date).toLocaleDateString(PROJECT.locale || 'fr-FR', {year:'numeric', month:'long', day:'numeric'})
    : dateFmt;
  const photoLoc = exif.location || PROJECT.location || '';
  const titleParts = [
    PROJECT.title  || '',
    PROJECT.author ? '\u00a9\u00a0' + PROJECT.author : '',
    photoDate,
    photoLoc,
  ].filter(Boolean);
  glTitle.textContent = titleParts.join('\u2002\u00b7\u2002');
}

/* ── Build GLightbox anchor elements ────────────────── */
/* Hidden <a> elements are the data source for GLightbox; the grid tiles
   call lb.openAt(idx) directly rather than relying on href clicks. */
const glItems = document.getElementById('gl-items');
PHOTOS.forEach((p, i) => {
  const a = document.createElement('a');
  a.href         = 'img/full/' + p.name + '.webp';
  a.className    = 'glightbox';
  a.dataset.type    = 'image';
  a.dataset.gallery = 'main';
  // Title and description are handled by fixed overlays (#gl-title, #gl-info-btn)
  glItems.appendChild(a);
});

/* ── Build editorial grid (12-photo repeating pattern) ─ */
/*
  Each cycle of 12 photos spans 6 rows in a 3-column CSS grid.
  Two "big" tiles occupy 2×2 cells to create visual rhythm:
    pos 0  → big-left  (col 1-2, rows 1-2)
    pos 8  → big-right (col 2-3, rows 4-5)
  All other positions are standard 1×1 small tiles.

  Detailed layout per cycle (r = first row of the cycle):
  Bloc A  r+0,r+1 : [big col1-2 rows 0-1] [small col3 row 0] / [big cont.] [small col3 row 1]
          r+2     : [small] [small] [small]
  Bloc B  r+3,r+4 : [small col1] [big col2-3 rows 3-4] / [small col1] [big cont.]
          r+5     : [small] [small] [small]
*/
const grid = document.getElementById('grid');

function makeTile(photo, idx) {
  const tile = document.createElement('div');
  tile.className    = 'tile';
  tile.dataset.idx  = idx;

  const isBig = photo.role === 'big';
  const img = document.createElement('img');
  img.src     = 'img/grid/' + photo.name + '.webp';
  img.srcset  = 'img/grid-sm/' + photo.name + '.webp ' + (isBig ? ${gridMobBig} : ${gridMobSmall}) + 'w, img/grid/' + photo.name + '.webp ' + (isBig ? '1400' : '800') + 'w';
  img.sizes   = isBig
    ? '(max-width: 767px) 66vw, 1400px'
    : '(max-width: 767px) 33vw, 800px';
  img.alt     = photo.name;
  img.loading = idx < 20 ? 'eager' : 'lazy';
  img.decoding= idx < 20 ? 'sync'  : 'async';
  if (idx === 0) img.fetchPriority = 'high';
  img.addEventListener('load', () => tile.classList.add('ready'));

  const num = document.createElement('span');
  num.className   = 'tile-n';
  num.textContent = idx + 1;

  tile.appendChild(img);
  tile.appendChild(num);

  // Per-photo photographer credit badge (shown on hover) — issue #133
  if (photo.credit) {
    const creditEl = document.createElement('span');
    creditEl.className   = 'tile-credit';
    creditEl.textContent = '\u00a9\u00a0' + photo.credit;
    tile.appendChild(creditEl);
  }

  tile.addEventListener('click', () => {
    lb.openAt(idx);
  });
  return tile;
}

/*
  tilePos returns the CSS grid-column and grid-row values for photo index i.
  The 12-position cycle maps directly to absolute row numbers so every cycle
  stacks cleanly below the previous one.
*/
function tilePos(i) {
  const cycle   = Math.floor(i / 12);
  const pos     = i % 12;
  const r       = cycle * 6 + 1; // first CSS grid row of this cycle (1-based)
  return [
    { col:'1 / span 2', row:\`\${r} / span 2\`,     big:true  }, // 0  big-left
    { col:'3',          row:\`\${r}\`,               big:false }, // 1
    { col:'3',          row:\`\${r + 1}\`,           big:false }, // 2
    { col:'1',          row:\`\${r + 2}\`,           big:false }, // 3
    { col:'2',          row:\`\${r + 2}\`,           big:false }, // 4
    { col:'3',          row:\`\${r + 2}\`,           big:false }, // 5
    { col:'1',          row:\`\${r + 3}\`,           big:false }, // 6
    { col:'1',          row:\`\${r + 4}\`,           big:false }, // 7
    { col:'2 / span 2', row:\`\${r + 3} / span 2\`, big:true  }, // 8  big-right
    { col:'1',          row:\`\${r + 5}\`,           big:false }, // 9
    { col:'2',          row:\`\${r + 5}\`,           big:false }, // 10
    { col:'3',          row:\`\${r + 5}\`,           big:false }, // 11
  ][pos];
}

for (let i = 0; i < PHOTOS.length; i++) {
  const tile = makeTile(PHOTOS[i], i);
  const pos  = tilePos(i);
  tile.style.gridColumn = pos.col;
  tile.style.gridRow    = pos.row;
  grid.appendChild(tile);
}

/* ── GLightbox configuration ─────────────────────────── */
const lb = GLightbox({
  selector:        '.glightbox',
  touchNavigation: true,
  keyboardNavigation: true,
  zoomable:        false,
  draggable:       true,
  loop:            true,
  skin:            'clean',
  descPosition:    'bottom',
  openEffect:      'fade',
  closeEffect:     'fade',
  slideEffect:     '${slideEffect}',
  plyr: {},
});

/* ── Thumbnail strip (tiny-slider) ──────────────────── */
/* The strip is built lazily on first lightbox open to avoid blocking
   the initial page render with DOM creation for potentially hundreds of items. */
let thumbSlider = null;
let thumbsReady = false;

async function buildThumbs() {
  if (thumbsReady) return;
  thumbsReady = true;

  // Load tiny-slider on demand — keeps it out of the critical path.
  if (typeof tns === 'undefined') {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '${vp}tiny-slider.js'; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const inner = document.getElementById('gl-thumbs-inner');
  inner.innerHTML = '';
  PHOTOS.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'tns-thumb-item';
    item.dataset.i = i;
    const img = document.createElement('img');
    img.src    = 'img/grid/' + p.name + '.webp';
    img.alt    = '';
    img.loading= 'lazy';
    item.appendChild(img);
    item.addEventListener('click', () => lb.openAt(i));
    inner.appendChild(item);
  });

  thumbSlider = tns({
    container:     '#gl-thumbs-inner',
    items:         Math.min(PHOTOS.length, 10),
    gutter:        2,
    mouseDrag:     true,
    swipeAngle:    false,
    speed:         300,
    nav:           false,
    controls:      false,
    responsive: {
      0:   { items: 5 },
      480: { items: 7 },
      768: { items: 9 },
      1024:{ items: 11 },
      1440:{ items: 13 },
    },
  });
}

function syncThumb(idx) {
  if (!thumbsReady) return;
  document.querySelectorAll('.tns-thumb-item').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  // Scroll the strip so the active thumbnail is centred in view.
  if (thumbSlider) {
    const info  = thumbSlider.getInfo();
    const items = info.items;
    const start = Math.max(0, idx - Math.floor(items / 2));
    thumbSlider.goTo(start);
  }
}

/* ── Download permissions ────────────────────────────── */
const DL_MODE        = PROJECT.downloadMode || (PROJECT.allowDownloadImage !== false ? 'display' : 'none');
const CAN_DL_IMAGE   = DL_MODE !== 'none';
const CAN_DL_GALLERY = DL_MODE !== 'none';

/* ── Overlay buttons: EXIF, Download, Fullscreen ─────── */
const exifOverlay = document.getElementById('gl-exif-overlay');
const exifInner   = document.getElementById('gl-exif-inner');
const dlBtn       = document.getElementById('gl-dl-btn');
const fsBtn       = document.getElementById('gl-fs-btn');
const infoBtn     = document.getElementById('gl-info-btn');
let exifOpen = false;
let dlCurrentPath = '';
let dlCurrentName = '';

// Hide download buttons if disabled in config.
if (!CAN_DL_IMAGE   && dlBtn)                                 dlBtn.remove();
if (!CAN_DL_GALLERY) document.getElementById('dl-all-btn')?.remove();

/* ── Per-photo download (Web Share API on iOS → Photos; fallback to <a> download) */
if (CAN_DL_IMAGE && dlBtn) {
  dlBtn.addEventListener('click', async () => {
    dlBtn.blur();
    // Web Share API with files — supported on iOS 15+ / Safari 15+ / Android Chrome.
    // On iOS this opens the native share sheet which offers "Save to Photos".
    if (navigator.share && navigator.canShare) {
      try {
        const res  = await fetch(dlCurrentPath);
        const blob = await res.blob();
        const mimeType = dlCurrentName.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
        const file = new File([blob], dlCurrentName, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: dlCurrentName });
          return;
        }
      } catch (_) { /* fall through to link download on error */ }
    }
    // Fallback: create a temporary <a download> and click it.
    const a = document.createElement('a');
    a.href = dlCurrentPath; a.download = dlCurrentName; a.click();
  });
}

/* Fullscreen toggle — visibility driven by CSS (body.glightbox-open rule).
   The button is removed entirely if the Fullscreen API is unavailable so it
   never shows as an inert element. */
if (fsBtn) {
  if (!document.fullscreenEnabled) {
    fsBtn.remove();   // API not available — drop the button from the DOM
  } else {
    fsBtn.addEventListener('click', () => {
      fsBtn.blur();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        fsBtn.setAttribute('title', 'Exit fullscreen');
      } else {
        document.exitFullscreen();
        fsBtn.setAttribute('title', 'Fullscreen');
      }
    });
    document.addEventListener('fullscreenchange', () => {
      const icon = document.fullscreenElement
        ? \`<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 1H2v3M14 6V2h-3M11 15h3v-3M2 10v4h3"/></svg>\`
        : \`<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6V2h4M10 2h4v4M15 10v4h-4M6 14H2v-4"/></svg>\`;
      fsBtn.innerHTML = icon;
    });
  }
}

function syncOverlays(idx) {
  const p = PHOTOS[idx];
  if (DL_MODE === 'original') {
    dlCurrentPath = 'originals/' + p.name + '.jpg';
    dlCurrentName = (p.dlName || p.name) + '.jpg';
  } else {
    dlCurrentPath = 'img/full/' + p.name + '.webp';
    dlCurrentName = (p.dlName || p.name) + '.webp';
  }
  if (exifOpen) exifInner.innerHTML = exifHTML(p.exif || {});
}

function showExif(idx) {
  exifInner.innerHTML = exifHTML(PHOTOS[idx].exif || {});
  exifOverlay.style.display = '';
  exifOpen = true;
  infoBtn.classList.add('active');
}

function hideExif() {
  exifOverlay.style.display = 'none';
  exifOpen = false;
  infoBtn.classList.remove('active');
}

/* ── Slideshow ───────────────────────────────────────── */
const SW_IDLE_DELAY  = 2500;   // ms of inactivity before hiding controls
const swBtn          = document.getElementById('slideshow-btn');
const swIntervalSel  = document.getElementById('sw-interval');
// Interval is read live from the selector so the user can change it mid-show.
const swGetInterval  = () => (parseInt(swIntervalSel.value, 10) || 3) * 1000;
const swIcon       = document.getElementById('sw-icon');
const glSwBtn      = document.getElementById('gl-sw-btn');
const glSwIcon     = document.getElementById('gl-sw-icon');

let   swActive     = false;
let   swTimer      = null;
let   idleTimer    = null;
let   lbOpen       = false;

const SW_ICON_PLAY  = \`<polygon points="3,1 15,8 3,15"/>\`;
const SW_ICON_PAUSE = \`<rect x="2" y="1" width="4" height="14"/><rect x="10" y="1" width="4" height="14"/>\`;

function swSetIcon(playing) {
  // Toolbar button
  swIcon.innerHTML = playing ? SW_ICON_PAUSE : SW_ICON_PLAY;
  swBtn.classList.toggle('active', playing);
  swBtn.title = playing ? 'Pause slideshow' : 'Start slideshow';
  swBtn.setAttribute('aria-label', swBtn.title);
  // Lightbox overlay button — visible only while slideshow is running
  glSwIcon.innerHTML = playing ? SW_ICON_PAUSE : SW_ICON_PLAY;
  glSwBtn.style.display = playing ? 'flex' : 'none';
  glSwBtn.title = playing ? 'Pause slideshow' : 'Resume slideshow';
  glSwBtn.setAttribute('aria-label', glSwBtn.title);
}

glSwBtn.addEventListener('click', () => {
  glSwBtn.blur();
  if (swActive) swPause(); else swStart(lb.getActiveSlideIndex());
});

/* ── Idle auto-hide ──────────────────────────────────── */
function swIdleReset() {
  document.body.classList.remove('sw-idle');
  clearTimeout(idleTimer);
  if (!swActive) return;
  idleTimer = setTimeout(() => {
    if (swActive) document.body.classList.add('sw-idle');
  }, SW_IDLE_DELAY);
}

function swIdleStop() {
  clearTimeout(idleTimer);
  idleTimer = null;
  document.body.classList.remove('sw-idle');
}

// Any activity resets the hide timer while slideshow is running.
['mousemove', 'mousedown', 'touchstart', 'touchmove', 'keydown'].forEach(evt => {
  document.addEventListener(evt, () => { if (swActive) swIdleReset(); }, { passive: true });
});

function swScheduleNext() {
  clearTimeout(swTimer);
  swTimer = setTimeout(() => {
    if (!swActive) return;
    const idx = lb.getActiveSlideIndex();
    if (idx >= PHOTOS.length - 1) { lb.openAt(0); } else { lb.nextSlide(); }
    // slide_changed event will call swScheduleNext() to keep the chain going.
  }, swGetInterval());
}

function swStart(startIdx) {
  swActive = true;
  document.body.classList.add('sw-playing');
  swSetIcon(true);
  if (!lbOpen) lb.openAt(startIdx ?? 0);
  // Try native fullscreen (silently ignored on iOS Safari).
  if (document.fullscreenEnabled && !document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
  swScheduleNext();
  swIdleReset();
}

function swPause() {
  swActive = false;
  document.body.classList.remove('sw-playing');
  clearTimeout(swTimer);
  swTimer = null;
  swSetIcon(false);
  swIdleStop();
}

function swStop() {
  swPause();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

swBtn.addEventListener('click', () => {
  if (swActive) swPause();
  else swStart(lbOpen ? lb.getActiveSlideIndex() : 0);
});

/* ── GLightbox event handlers ────────────────────────── */
// Overlay buttons live outside the GLightbox dialog; GLightbox sets
// aria-hidden="true" on them when the lightbox opens or navigates.
// If any of these buttons has focus at that moment the browser logs an
// accessibility warning.  blurOverlays() is called before every such event
// AND on each button's own click handler so focus is never retained.
const OVERLAY_BTNS = [glSwBtn, fsBtn, dlBtn, infoBtn].filter(Boolean);
function blurOverlays() {
  OVERLAY_BTNS.forEach(b => { if (document.activeElement === b) b.blur(); });
}

lb.on('open', () => {
  lbOpen = true;
  blurOverlays();
  buildThumbs();
  const idx = lb.getActiveSlideIndex();
  document.getElementById('gl-thumbs').style.display = 'block';
  if (CAN_DL_IMAGE && dlBtn) dlBtn.style.display = 'flex';
  infoBtn.style.display = 'flex';
  syncOverlays(idx);
  syncThumb(idx);
  updateTitleColor(idx);
  history.replaceState(null, '', '#' + PHOTOS[idx].name);
});

lb.on('slide_changed', ({ current }) => {
  blurOverlays();
  const idx = current.index;
  syncOverlays(idx);
  syncThumb(idx);
  updateTitleColor(idx);
  if (exifOpen) showExif(idx);
  if (swActive) swScheduleNext();  // reset countdown on every slide (swipe or auto)
  history.replaceState(null, '', '#' + PHOTOS[idx].name);
});

lb.on('close', () => {
  lbOpen = false;
  document.getElementById('gl-thumbs').style.display = 'none';
  if (CAN_DL_IMAGE && dlBtn) dlBtn.style.display = 'none';
  infoBtn.style.display = 'none';
  hideExif();
  swStop();
  history.replaceState(null, '', location.pathname);
});

/* ── Deep-link: open lightbox at photo from URL hash on page load ── */
(function () {
  const name = location.hash.slice(1);
  if (!name) return;
  const idx = PHOTOS.findIndex(p => p.name === name);
  if (idx >= 0) lb.openAt(idx);
})();

/* (i) button toggles the EXIF overlay for the currently displayed photo */
infoBtn.addEventListener('click', () => {
  infoBtn.blur();
  if (exifOpen) hideExif();
  else showExif(lb.getActiveSlideIndex());
});

/* ── Multilingual legal notice ───────────────────────── */
const legalOverlay = document.getElementById('legal-overlay');
const legalBody    = document.getElementById('legal-body');

/** Close the legal overlay — one helper so there is no repetition. */
function closeLegalOverlay() { legalOverlay.style.display = 'none'; }

const LEGAL_I18N = {
  en: {
    btn:   "Legal notice",
    title: "Protected Photographs \u2013 Legal Information",
    intro: (a,yr) => \`The images in this folder are original works by <strong>\${a}</strong> (\u00a9\u00a0\${yr}). They are protected by Swiss copyright law. Any unauthorised use is strictly prohibited.\`,
    h1:    "Usage rights",
    p1:    "Under the <strong>Federal Act on Copyright and Related Rights (CopA)</strong>, all exclusive rights to these photographs belong to their author. This includes:",
    b1:    ["The right to decide on the use of their works (Art.\u00a010 CopA)", "Automatic recognition of the author as rights holder (Art.\u00a02 CopA)"],
    law:   "Copyright Act \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/en",
    h2:    "Conditions of use",
    p2:    "Access to these photographs is limited to <strong>private use</strong> (cf.\u00a0Art.\u00a019 CopA). This means you may:",
    b2:    ["View them", "Copy or print them <strong>for personal use only</strong>"],
    p2b:   "Any other use (publication, reproduction, distribution, adaptation, etc.) is strictly prohibited without <strong>written authorisation</strong> from the author.",
    h3:    "Permission requests",
    p3:    "To use one or more photographs for other purposes (publication, artistic project, website, exhibition, etc.), please contact the author:",
    footer:"Thank you for respecting these conditions and supporting the protection of artistic creation.",
    work:  "Work",
    anon:  "Anonymous",
    hPhot: "Photographers",
  },
  fr: {
    btn:   "Mentions l\u00e9gales",
    title: "Photographies prot\u00e9g\u00e9es \u2013 Informations l\u00e9gales",
    intro: (a,yr) => \`Les images contenues dans ce dossier sont des \u0153uvres originales de <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Elles sont prot\u00e9g\u00e9es par la l\u00e9gislation suisse en mati\u00e8re de droit d\u2019auteur. Toute utilisation non autoris\u00e9e est interdite.\`,
    h1:    "Droits d\u2019utilisation",
    p1:    "En vertu de la <strong>Loi f\u00e9d\u00e9rale sur le droit d\u2019auteur et les droits voisins (LDA)</strong>, les droits exclusifs appartiennent \u00e0 leur auteur\u00a0:",
    b1:    ["Le droit de d\u00e9cider de l\u2019utilisation de ses \u0153uvres (art.\u00a010 LDA)", "La reconnaissance automatique de l\u2019auteur comme titulaire des droits (art.\u00a02 LDA)"],
    law:   "Loi sur le droit d\u2019auteur \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/fr",
    h2:    "Conditions d\u2019utilisation",
    p2:    "L\u2019acc\u00e8s aux photographies est limit\u00e9 \u00e0 un <strong>usage priv\u00e9</strong> (cf.\u00a0art.\u00a019 LDA). Cela signifie que vous pouvez\u00a0:",
    b2:    ["Les visualiser", "Les copier ou les imprimer <strong>pour un usage personnel uniquement</strong>"],
    p2b:   "Toute autre utilisation (publication, reproduction, diffusion, adaptation, etc.) est strictement interdite sans une <strong>autorisation \u00e9crite</strong> de l\u2019auteur.",
    h3:    "Demande d\u2019autorisation",
    p3:    "Pour utiliser une ou plusieurs photographies dans un autre cadre, merci de contacter l\u2019auteur\u00a0:",
    footer:"Merci de respecter ces conditions et de contribuer \u00e0 la protection de la cr\u00e9ation artistique.",
    work:  "\u0152uvre",
    anon:  "Anonyme",
    hPhot: "Photographes",
  },
  de: {
    btn:   "Rechtliche Hinweise",
    title: "Urheberrechtlich gesch\u00fctzte Fotografien \u2013 Rechtliche Informationen",
    intro: (a,yr) => \`Die in diesem Ordner enthaltenen Bilder sind Originalwerke von <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Sie sind durch das schweizerische Urheberrecht gesch\u00fctzt. Jede unbefugte Nutzung ist untersagt.\`,
    h1:    "Nutzungsrechte",
    p1:    "Gem\u00e4\u00df dem <strong>Bundesgesetz \u00fcber das Urheberrecht und verwandte Schutzrechte (URG)</strong> liegen die ausschlie\u00dflichen Rechte beim Autor:",
    b1:    ["Das Recht, \u00fcber die Verwendung seiner Werke zu entscheiden (Art.\u00a010 URG)", "Die automatische Anerkennung des Autors als Rechteinhaber (Art.\u00a02 URG)"],
    law:   "Urheberrechtsgesetz \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/de",
    h2:    "Nutzungsbedingungen",
    p2:    "Der Zugang zu den Fotografien ist auf den <strong>privaten Gebrauch</strong> beschr\u00e4nkt (vgl.\u00a0Art.\u00a019 URG). Das bedeutet:",
    b2:    ["Sie d\u00fcrfen sie ansehen", "Sie d\u00fcrfen sie <strong>ausschlie\u00dflich f\u00fcr den pers\u00f6nlichen Gebrauch</strong> kopieren oder drucken"],
    p2b:   "Jede andere Verwendung (Ver\u00f6ffentlichung, Vervielf\u00e4ltigung, Verbreitung, Bearbeitung usw.) ist ohne <strong>schriftliche Genehmigung</strong> des Autors verboten.",
    h3:    "Genehmigungsanfragen",
    p3:    "F\u00fcr die Nutzung einer oder mehrerer Fotografien zu anderen Zwecken wenden Sie sich bitte an den Autor:",
    footer:"Vielen Dank, dass Sie diese Bedingungen einhalten und zum Schutz k\u00fcnstlerischer Werke beitragen.",
    work:  "Werk",
    anon:  "Anonym",
    hPhot: "Fotografen",
  },
  it: {
    btn:   "Note legali",
    title: "Fotografie protette \u2013 Informazioni legali",
    intro: (a,yr) => \`Le immagini contenute in questa cartella sono opere originali di <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Sono protette dalla legislazione svizzera sul diritto d\u2019autore. Qualsiasi utilizzo non autorizzato \u00e8 vietato.\`,
    h1:    "Diritti d\u2019uso",
    p1:    "Ai sensi della <strong>Legge federale sul diritto d\u2019autore e sui diritti affini (LDA)</strong>, i diritti esclusivi appartengono al loro autore:",
    b1:    ["Il diritto di decidere l\u2019utilizzo delle proprie opere (art.\u00a010 LDA)", "Il riconoscimento automatico dell\u2019autore come titolare dei diritti (art.\u00a02 LDA)"],
    law:   "Legge sul diritto d\u2019autore \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/it",
    h2:    "Condizioni d\u2019uso",
    p2:    "L\u2019accesso alle fotografie \u00e8 limitato all\u2019<strong>uso privato</strong> (cfr.\u00a0art.\u00a019 LDA). Ci\u00f2 significa che \u00e8 possibile:",
    b2:    ["Visualizzarle", "Copiarle o stamparle <strong>esclusivamente per uso personale</strong>"],
    p2b:   "Qualsiasi altro utilizzo (\u00e8 vietato senza <strong>autorizzazione scritta</strong> dell\u2019autore.",
    h3:    "Richieste di autorizzazione",
    p3:    "Per utilizzare una o pi\u00f9 fotografie per altri scopi, la preghiamo di contattare l\u2019autore:",
    footer:"Grazie per aver rispettato queste condizioni e per contribuire alla tutela della creazione artistica.",
    work:  "Opera",
    anon:  "Anonimo",
    hPhot: "Fotografi",
  },
  es: {
    btn:   "Aviso legal",
    title: "Fotograf\u00edas protegidas \u2013 Informaci\u00f3n legal",
    intro: (a,yr) => \`Las im\u00e1genes contenidas en esta carpeta son obras originales de <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Est\u00e1n protegidas por la legislaci\u00f3n suiza sobre derechos de autor. Cualquier uso no autorizado est\u00e1 prohibido.\`,
    h1:    "Derechos de uso",
    p1:    "En virtud de la <strong>Ley Federal sobre Derechos de Autor y Derechos Afines (LDA)</strong>, los derechos exclusivos pertenecen a su autor:",
    b1:    ["El derecho a decidir el uso de sus obras (art.\u00a010 LDA)", "El reconocimiento autom\u00e1tico del autor como titular de los derechos (art.\u00a02 LDA)"],
    law:   "Ley de derechos de autor \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/fr",
    h2:    "Condiciones de uso",
    p2:    "El acceso a las fotograf\u00edas est\u00e1 limitado al <strong>uso privado</strong> (cf.\u00a0art.\u00a019 LDA). Esto significa que puede:",
    b2:    ["Visualizarlas", "Copiarlas o imprimirlas <strong>\u00fanicamente para uso personal</strong>"],
    p2b:   "Cualquier otro uso est\u00e1 estrictamente prohibido sin <strong>autorizaci\u00f3n escrita</strong> del autor.",
    h3:    "Solicitudes de autorizaci\u00f3n",
    p3:    "Para utilizar una o m\u00e1s fotograf\u00edas para otros fines, p\u00f3ngase en contacto con el autor:",
    footer:"Gracias por respetar estas condiciones y contribuir a la protecci\u00f3n de la creaci\u00f3n art\u00edstica.",
    work:  "Obra",
    anon:  "An\u00f3nimo",
    hPhot: "Fotógrafos",
  },
  pt: {
    btn:   "Aviso legal",
    title: "Fotografias protegidas \u2013 Informa\u00e7\u00f5es legais",
    intro: (a,yr) => \`As imagens contidas nesta pasta s\u00e3o obras originais de <strong>\${a}</strong> (\u00a9\u00a0\${yr}). Est\u00e3o protegidas pela legisla\u00e7\u00e3o su\u00ed\u00e7a de direitos de autor. Qualquer utiliza\u00e7\u00e3o n\u00e3o autorizada \u00e9 proibida.\`,
    h1:    "Direitos de utiliza\u00e7\u00e3o",
    p1:    "Nos termos da <strong>Lei Federal sobre Direito de Autor e Direitos Conexos (LDA)</strong>, os direitos exclusivos pertencem ao seu autor:",
    b1:    ["O direito de decidir sobre a utiliza\u00e7\u00e3o das suas obras (art.\u00a010 LDA)", "O reconhecimento autom\u00e1tico do autor como titular dos direitos (art.\u00a02 LDA)"],
    law:   "Lei de direitos de autor \u2013 Fedlex",
    lawUrl:"https://www.fedlex.admin.ch/eli/cc/1993/1798_1798_1798/fr",
    h2:    "Condi\u00e7\u00f5es de utiliza\u00e7\u00e3o",
    p2:    "O acesso \u00e0s fotografias est\u00e1 limitado ao <strong>uso privado</strong> (cf.\u00a0art.\u00a019 LDA). Isso significa que pode:",
    b2:    ["Visualiz\u00e1-las", "Copi\u00e1-las ou imprimi-las <strong>apenas para uso pessoal</strong>"],
    p2b:   "Qualquer outro uso \u00e9 estritamente proibido sem <strong>autoriza\u00e7\u00e3o escrita</strong> do autor.",
    h3:    "Pedidos de autoriza\u00e7\u00e3o",
    p3:    "Para utilizar uma ou mais fotografias para outros fins, por favor contacte o autor:",
    footer:"Obrigado por respeitar estas condi\u00e7\u00f5es e contribuir para a prote\u00e7\u00e3o da cria\u00e7\u00e3o art\u00edstica.",
    work:  "Obra",
    anon:  "An\u00f4nimo",
    hPhot: "Fotógrafos",
  },
};

function buildLegalHTML(l) {
  // Custom template takes full priority over the built-in multilingual strings.
  if (PROJECT.legalHtml) return PROJECT.legalHtml;
  const T  = LEGAL_I18N[l] || LEGAL_I18N.en;
  const a  = PROJECT.author || (PROJECT.photographers && PROJECT.photographers.length > 0 ? PROJECT.photographers.join(', ') : T.anon);
  const yr = PROJECT.date ? PROJECT.date.slice(0,4) : new Date().getFullYear();
  const em = PROJECT.authorEmail
    ? \`<a href="mailto:\${PROJECT.authorEmail}">\${PROJECT.authorEmail}</a>\`
    : '';
  const li = arr => arr.map(x => \`<li>\${x}</li>\`).join('');

  // Work identification block — only render fields that are actually set in the config.
  const workParts = [
    PROJECT.title    ? \`<strong>\${PROJECT.title}</strong>\`    : null,
    PROJECT.subtitle ? \`<em>\${PROJECT.subtitle}</em>\`         : null,
    PROJECT.location ? PROJECT.location                         : null,
  ].filter(Boolean);
  const workBlock = workParts.length
    ? \`<h2>\${T.work}</h2><p>\${workParts.join(' \u00b7 ')}</p>\${PROJECT.description ? '<p><em>' + PROJECT.description + '</em></p>' : ''}\`
    : '';

  const pgList = PROJECT.photographers || [];
  const photBlock = pgList.length > 0
    ? \`<h2>\${T.hPhot || 'Photographers'}</h2><ul>\${pgList.map(n => \`<li>\u00a9\u00a0\${n}</li>\`).join('')}</ul>\`
    : '';

  return \`
    <h1>\${T.title}</h1>
    \${workBlock}
    <p>\${T.intro(a, yr)}</p>
    \${photBlock}
    <h2>\${T.h1}</h2>
    <p>\${T.p1}</p>
    <ul>\${li(T.b1)}</ul>
    <p><a href="\${T.lawUrl}" target="_blank" rel="noopener">\${T.law}</a></p>
    <h2>\${T.h2}</h2>
    <p>\${T.p2}</p>
    <ul>\${li(T.b2)}</ul>
    <p>\${T.p2b}</p>
    <h2>\${T.h3}</h2>
    <p>\${T.p3}</p>
    <p><strong>\${a}</strong>\${em ? '<br>' + em : ''}</p>
    <hr>
    <p>\${T.footer}</p>
  \`;
}

function buildLegalText(l) {
  // Custom template takes full priority over the built-in multilingual strings.
  if (PROJECT.legalTxt) return PROJECT.legalTxt;
  const T    = LEGAL_I18N[l] || LEGAL_I18N.en;
  const a    = PROJECT.author || (PROJECT.photographers && PROJECT.photographers.length > 0 ? PROJECT.photographers.join(', ') : T.anon);
  const yr   = PROJECT.date ? PROJECT.date.slice(0,4) : new Date().getFullYear();
  const em   = PROJECT.authorEmail || '';
  const strip = s => s.replace(/<[^>]*>/g, '');
  const sep  = '-'.repeat(60);

  // Work identification block (plain-text version, only non-empty fields).
  const workLines = [PROJECT.title, PROJECT.subtitle, PROJECT.location].filter(Boolean);
  const workSection = workLines.length
    ? [T.work.toUpperCase(), workLines.join(' \u00b7 '), ...(PROJECT.description ? [PROJECT.description] : []), '']
    : [];

  const pgList = PROJECT.photographers || [];
  const photSection = pgList.length > 0
    ? [(T.hPhot || 'Photographers').toUpperCase(), ...pgList.map(n => '  \u00a9 ' + n), '']
    : [];

  return [
    T.title, sep, '',
    ...workSection,
    strip(T.intro(a, yr)), '',
    ...photSection,
    T.h1.toUpperCase(),
    strip(T.p1),
    T.b1.map(b => '  \u2022 ' + strip(b)).join('\\n'),
    T.law + ': ' + T.lawUrl, '',
    T.h2.toUpperCase(),
    strip(T.p2),
    T.b2.map(b => '  \u2022 ' + strip(b)).join('\\n'),
    strip(T.p2b), '',
    T.h3.toUpperCase(),
    strip(T.p3),
    a + (em ? '\\n' + em : ''),
    '', sep, T.footer,
  ].join('\\n');
}

// Localize the "Legal notice" button to match the gallery's locale.
document.getElementById('legal-btn').textContent = (LEGAL_I18N[lang] || LEGAL_I18N.en).btn;

document.getElementById('legal-btn').addEventListener('click', () => {
  legalBody.innerHTML = buildLegalHTML(lang);
  legalOverlay.style.display = 'flex';
});
document.getElementById('legal-close').addEventListener('click', closeLegalOverlay);
legalOverlay.addEventListener('click', e => {
  if (e.target === legalOverlay) closeLegalOverlay();
});

/* ── ESC key — multi-level close ─────────────────────── */
/* Priority order: legal overlay → EXIF overlay → GLightbox (native).
   stopImmediatePropagation prevents GLightbox from consuming the event
   when an overlay above it is dismissed first. */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (legalOverlay.style.display !== 'none') {
    e.stopImmediatePropagation();
    closeLegalOverlay();
    return;
  }
  if (exifOpen) {
    e.stopImmediatePropagation();
    hideExif();
    return;
  }
  // otherwise GLightbox handles ESC natively → closes the lightbox → returns to grid
}, true);

/* ── Bulk ZIP download ───────────────────────────────── */
/* Fetches all original JPEGs one by one, bundles them into a ZIP archive
   together with a multilingual legal notice text file, and triggers a
   browser download.  JSZip is loaded from dist/vendor/jszip.min.js. */
(function () {
  const btn   = document.getElementById('dl-all-btn');
  const label = document.getElementById('dl-all-label');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    // Load JSZip on-demand (not included at page load to save ~77 KB).
    if (typeof JSZip === 'undefined') {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = '${vp}jszip.min.js'; s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    const zip = new JSZip();
    let ok = 0;

    for (let i = 0; i < PHOTOS.length; i++) {
      label.textContent = \`\${i + 1} / \${PHOTOS.length}…\`;
      try {
        const dlSrc = DL_MODE === 'original'
          ? ('originals/' + PHOTOS[i].name + '.jpg')
          : ('img/full/' + PHOTOS[i].name + '.webp');
        const dlExt = DL_MODE === 'original' ? '.jpg' : '.webp';
        const res  = await fetch(dlSrc);
        if (res.ok) { zip.file((PHOTOS[i].dlName || PHOTOS[i].name) + dlExt, await res.blob()); ok++; }
      } catch (_) {}
    }

    label.textContent = 'Zipping\u2026';
    // Include only the gallery locale (fallback to EN if not supported).
    const legalLang = LEGAL_I18N[lang] ? lang : 'en';
    zip.file('LEGAL_NOTICE.txt', buildLegalText(legalLang));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 3 } });
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    // Slugify the title: strip accents, lowercase, hyphens — gives clean filenames.
    a.download = (PROJECT.title || 'galerie')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      + '.zip';
    a.click();
    URL.revokeObjectURL(a.href);

    label.textContent = 'Download all';
    btn.disabled = false;
  });
})();
`;

  // Inline data.js and gallery.js directly into the HTML so the gallery works
  // regardless of URL path (no trailing-slash issues, deployable in any sub-folder).
  const inlinedHtml = html
    .replace('<script src="data.js"></script>', `<script>\n${dataJs}</script>`)
    .replace('<script src="gallery.js"></script>', `<script>\n${galleryJs}</script>`);

  return { html: inlinedHtml, dataJs, galleryJs };
}

// ── Site index HTML generation ────────────────────────────────────────────────

/**
 * Generate the site index page (dist/index.html) listing all public galleries.
 *
 * @param {string} fontCss - Inlinable @font-face CSS.
 * @param {string} [VERSION] - GalleryPack version string for footer credit.
 */
export function buildIndexHTML(fontCss, VERSION = '0.0.0') {
  // index.html sits at dist/ root, so fonts/ is a sibling dir (not ../fonts/).
  const rootFontCss = fontCss.replace(/url\('\.\.\/fonts\//g, "url('fonts/");
  fontCss = rootFontCss;
  const galleries = collectBuiltGalleries();

  // Sort by project date descending (most recent first), then alphabetically.
  galleries.sort((a, b) => {
    const da = a.project.date || '';
    const db = b.project.date || '';
    return db.localeCompare(da) || (a.project.title || '').localeCompare(b.project.title || '');
  });

  const cards = galleries.map(g => {
    const p      = g.project;
    const yr     = p.date ? p.date.slice(0, 4) : '';
    const meta   = [p.location, yr].filter(Boolean).join(' \u00b7 ');
    // Password-protected galleries serve their cover from dist/covers/ (outside
    // the .htaccess zone) so the site index can display it without a 401 error.
    const v      = g.buildMtime || '';
    const bgImg  = g.firstPhoto
      ? (g.project.access === 'password'
        ? `<img class="card-bg" src="covers/${escHtml(g.distName)}.webp?v=${v}" alt="" loading="lazy">`
        : `<img class="card-bg" src="${escHtml(g.distName)}/img/grid/${escHtml(g.firstPhoto)}.webp?v=${v}" alt="" loading="lazy">`)
      : `<div class="card-bg card-bg-empty"></div>`;
    const subtitleHtml  = p.subtitle    ? `<div class="card-sub">${escHtml(p.subtitle)}</div>`   : '';
    const authorHtml    = p.author      ? `<div class="card-author">\u00a9\u00a0${escHtml(p.author)}</div>` : '';
    const metaHtml      = meta          ? `<span>${escHtml(meta)}</span>` : '';
    const countHtml     = `<span class="card-count">${g.photoCount}\u00a0photo${g.photoCount !== 1 ? 's' : ''}</span>`;
    const lockHtml      = p.access === 'password'
      ? `<div class="card-lock" title="Galerie protégée par mot de passe"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1a5 5 0 0 0-5 5v3H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V11a2 2 0 0 0-2-2h-2V6a5 5 0 0 0-5-5zm-3 5a3 3 0 0 1 6 0v3H9V6zm3 6a2 2 0 0 1 1 3.73V17a1 1 0 0 1-2 0v-1.27A2 2 0 0 1 12 12z"/></svg></div>`
      : '';
    return `<a class="card" href="${escHtml(g.distName)}/">
  ${bgImg}
  ${lockHtml}
  <div class="card-body">
    <div class="card-title">${escHtml(p.title || g.distName)}</div>
    ${subtitleHtml}
    ${authorHtml}
    <div class="card-meta">${metaHtml}${metaHtml && countHtml ? '<span class="card-sep">\u00b7</span>' : ''}${countHtml}</div>
  </div>
</a>`;
  }).join('\n');

  const emptyState = galleries.length === 0
    ? `<p class="empty">No gallery built yet. Run <code>npm run build:all</code>.</p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GalleryPack</title>
<style>
${fontCss}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#1c1c1c;--ink:#e8e4dd;--muted:#706860;--accent:#c8a96e;--gap:2px;--bar:56px}
html,body{min-height:100%;background:var(--bg);color:var(--ink);font-family:'Poppins',sans-serif}
.bar{
  position:fixed;top:0;left:0;right:0;height:var(--bar);
  display:flex;align-items:center;padding:0 24px;
  background:rgba(0,0,0,.85);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);
  border-bottom:1px solid rgba(255,255,255,.07);z-index:90
}
.bar-title{font-size:15px;font-weight:600;letter-spacing:-.01em}
.bar-sub{font-size:10px;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
.wrap{padding:calc(var(--bar) + 32px) 24px 48px}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(280px,1fr));
  gap:16px;max-width:1200px;margin:0 auto
}
.card{
  display:block;position:relative;
  aspect-ratio:3/2;overflow:hidden;border-radius:8px;
  text-decoration:none;background:#111;
  transition:transform .25s cubic-bezier(.25,.46,.45,.94),box-shadow .25s
}
.card:hover{transform:translateY(-3px);box-shadow:0 12px 40px rgba(0,0,0,.6)}
.card-bg{
  position:absolute;inset:0;width:100%;height:100%;
  object-fit:cover;display:block;
  transition:transform .4s cubic-bezier(.25,.46,.45,.94)
}
.card:hover .card-bg{transform:scale(1.04)}
.card-bg-empty{position:absolute;inset:0;background:linear-gradient(135deg,#1a1a1a,#111)}
.card-body{
  position:absolute;inset:0;
  background:linear-gradient(to top,rgba(0,0,0,.88) 0%,rgba(0,0,0,.1) 65%,transparent 100%);
  display:flex;flex-direction:column;justify-content:flex-end;
  padding:18px 20px
}
.card-title{font-size:14px;font-weight:600;color:#fff;line-height:1.3;margin-bottom:3px}
.card-sub{font-size:11px;color:rgba(255,255,255,.55);margin-bottom:3px;font-weight:300}
.card-author{font-size:11px;color:rgba(255,255,255,.45);margin-bottom:6px;font-weight:300}
.card-meta{
  display:flex;align-items:center;gap:6px;
  font-size:10px;color:rgba(255,255,255,.35);letter-spacing:.04em
}
.card-sep{color:rgba(255,255,255,.2)}
.card-count{color:var(--accent);font-weight:500}
.card-lock{
  position:absolute;top:10px;right:10px;
  width:28px;height:28px;
  display:flex;align-items:center;justify-content:center;
  background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  border-radius:50%;color:rgba(255,255,255,.75);z-index:2
}
.card-lock svg{width:13px;height:13px}
.empty{color:var(--muted);font-size:13px;text-align:center;padding:48px 0}
.empty code{color:rgba(255,255,255,.5);font-family:monospace;font-size:12px}
.footer{text-align:center;padding:0 0 32px;font-size:10px;color:rgba(255,255,255,.15);letter-spacing:.1em;text-transform:uppercase}
.footer a{color:rgba(255,255,255,.2);text-decoration:none}.footer a:hover{color:rgba(255,255,255,.5)}
</style>
</head>
<body>
<div class="bar">
  <div>
    <div class="bar-title">Galleries</div>
    <div class="bar-sub">${galleries.length} public galerie${galleries.length !== 1 ? 's' : ''}</div>
  </div>
</div>
<main class="wrap">
  <div class="grid">
${emptyState}
${cards}
  </div>
</main>
<footer class="footer">
  <a href="https://github.com/pvollenweider/gallerypack" target="_blank" rel="noopener">GalleryPack v${VERSION}</a>
</footer>
</body>
</html>`;

  fs.writeFileSync(path.join(DIST_ROOT, 'index.html'), html, 'utf8');
  ok('index.html → dist/  (site index)');
}
