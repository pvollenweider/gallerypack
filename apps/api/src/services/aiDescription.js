// Copyright (c) 2026 Philippe Vollenweider
//
// This file is part of the GalleryPack commercial platform.
// This source code is proprietary and confidential.
// Use, reproduction, or distribution requires a valid commercial license.
// Unauthorized use is strictly prohibited.

// apps/api/src/services/aiDescription.js — Claude Vision AI photo description

import Anthropic from '@anthropic-ai/sdk';

const LOCALE_TO_LANG = {
  'fr': 'French', 'fr-FR': 'French', 'fr-CH': 'French', 'fr-BE': 'French',
  'en': 'English', 'en-US': 'English', 'en-GB': 'English',
  'de': 'German', 'de-DE': 'German', 'de-CH': 'German', 'de-AT': 'German',
  'it': 'Italian', 'it-IT': 'Italian', 'it-CH': 'Italian',
  'es': 'Spanish', 'es-ES': 'Spanish',
  'pt': 'Portuguese', 'pt-PT': 'Portuguese', 'pt-BR': 'Portuguese',
  'nl': 'Dutch', 'nl-NL': 'Dutch', 'nl-BE': 'Dutch',
  'pl': 'Polish', 'pl-PL': 'Polish',
  'ru': 'Russian', 'ru-RU': 'Russian',
  'ja': 'Japanese', 'ja-JP': 'Japanese',
  'zh': 'Chinese', 'zh-CN': 'Chinese', 'zh-TW': 'Chinese',
  'ko': 'Korean', 'ko-KR': 'Korean',
  'ar': 'Arabic', 'ar-SA': 'Arabic',
  'sv': 'Swedish', 'sv-SE': 'Swedish',
  'da': 'Danish', 'da-DK': 'Danish',
  'fi': 'Finnish', 'fi-FI': 'Finnish',
  'no': 'Norwegian', 'nb': 'Norwegian',
};

/**
 * Generate a photo description using Claude Vision.
 *
 * @param {Buffer} imageBuffer - Raw image bytes
 * @param {string} mediaType   - MIME type, e.g. 'image/jpeg'
 * @param {string} locale      - BCP-47 locale string, e.g. 'fr' or 'en-US'
 * @returns {Promise<string>}  - Description text
 */
export async function generateDescription(imageBuffer, mediaType, locale) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const lang   = LOCALE_TO_LANG[locale] || LOCALE_TO_LANG[locale?.split('-')[0]] || 'English';
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 256,
    messages: [{
      role:    'user',
      content: [
        {
          type:   'image',
          source: {
            type:       'base64',
            media_type: mediaType,
            data:       imageBuffer.toString('base64'),
          },
        },
        {
          type: 'text',
          text: `Describe this photo in ${lang}. Write 1-2 sentences suitable as an image caption and alt text. Be specific and descriptive. Return only the description, no preamble.`,
        },
      ],
    }],
  });

  const block = response.content.find(b => b.type === 'text');
  return block?.text?.trim() ?? '';
}
