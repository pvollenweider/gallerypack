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

import { LocalStorage } from './local.js';
import { S3Storage }    from './s3.js';

export { LocalStorage, S3Storage };

/**
 * Create a storage adapter based on environment variables.
 *
 * STORAGE_DRIVER=local (default) | s3
 * STORAGE_ROOT — root directory for local storage (default: process.cwd())
 * S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_CDN_URL — for S3 driver
 */
export function createStorage(env = process.env) {
  const driver = env.STORAGE_DRIVER || 'local';
  if (driver === 'local') {
    return new LocalStorage(env.STORAGE_ROOT || process.cwd());
  }
  if (driver === 's3') {
    return new S3Storage({
      bucket:   env.S3_BUCKET,
      region:   env.S3_REGION,
      endpoint: env.S3_ENDPOINT,
      cdnUrl:   env.S3_CDN_URL,
    });
  }
  throw new Error(`Unknown storage driver: "${driver}". Valid values: local, s3`);
}
