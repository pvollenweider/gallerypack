/**
 * GalleryPack v2 — server/settings.js
 * Persistent key-value settings store (JSON file).
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __DIR = path.dirname(fileURLToPath(import.meta.url));
const FILE  = path.join(__DIR, 'settings.json');

let store = {};

function load() {
  try { store = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { store = {}; }
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2) + '\n', 'utf8'); } catch (_) {}
}
load();

export function getSetting(key, fallback = null) {
  return store[key] ?? fallback;
}

export function getSettings() {
  return { ...store };
}

export function saveSettings(updates) {
  Object.assign(store, updates);
  save();
}
