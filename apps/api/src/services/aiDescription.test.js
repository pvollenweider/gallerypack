// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/aiDescription.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('generateDescription', () => {
  test('throws when ANTHROPIC_API_KEY is not set', async () => {
    const savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      // Dynamic import to get fresh module (avoids module cache issues)
      const { generateDescription } = await import('./aiDescription.js');
      await assert.rejects(
        () => generateDescription(Buffer.from('x'), 'image/jpeg', 'en'),
        /ANTHROPIC_API_KEY/
      );
    } finally {
      if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
    }
  });
});
