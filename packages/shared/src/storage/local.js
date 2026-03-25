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

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Local filesystem storage adapter.
 * All paths are relative to `root`.
 */
export class LocalStorage {
  constructor(root) {
    this.root = root;
  }

  #abs(p) { return path.join(this.root, p); }

  async read(p) {
    return fs.readFile(this.#abs(p));
  }

  async write(p, data) {
    const abs = this.#abs(p);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data);
  }

  async exists(p) {
    try { await fs.access(this.#abs(p)); return true; } catch { return false; }
  }

  async list(prefix) {
    const dir = this.#abs(prefix);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.filter(e => e.isFile()).map(e => path.join(prefix, e.name));
    } catch { return []; }
  }

  async delete(p) {
    try { await fs.unlink(this.#abs(p)); } catch { /* ignore */ }
  }

  url(p) {
    // Relative URL for Express static serving
    return '/' + p.replace(/\\/g, '/');
  }
}
