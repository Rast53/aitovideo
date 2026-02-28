#!/usr/bin/env node

/**
 * Generate platform icons via Gemini API (gemini-3.1-flash-image).
 * Requires GEMINI_API_KEY env var.
 * Falls back to a message if the API is unavailable.
 *
 * Usage: GEMINI_API_KEY=your-key node scripts/generate-icons.mjs
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'miniapp', 'src', 'assets', 'icons');

const API_KEY = process.env.GEMINI_API_KEY;

const PROMPTS = {
  youtube: 'Minimalist app icon for a video platform. Red and white color scheme. A bold play triangle inside a softly rounded rectangle with a subtle gloss effect. Modern flat design with slight depth. Clean, no text, no labels. Style: contemporary tech product icon, reminiscent of streaming apps but visually distinct and original. 512x512px',
  vk: 'Minimalist app icon for a social video platform. Deep blue and white color scheme. Abstract letter V with smooth curves inside a circle with soft gradient background. Modern flat design with subtle shadow. Clean, no text, no labels. Style: contemporary social app icon, inspired by Eastern European design sensibility, original and unique. 512x512px',
  rutube: 'Minimalist app icon for a video hosting platform. Green and white color scheme. Abstract play button with a subtle wave or stream motif inside a rounded square. Modern flat design with gradient. Clean, no text, no labels. Style: contemporary streaming platform icon, fresh and distinct, Russian design aesthetic. 512x512px',
};

async function generateIcon(name, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${API_KEY}`;

  const body = {
    contents: [{
      parts: [{ text: prompt }],
    }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      imageMimeType: 'image/png',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));

  if (!imagePart) {
    throw new Error(`No image returned for ${name}. Response: ${JSON.stringify(data).slice(0, 500)}`);
  }

  return Buffer.from(imagePart.inlineData.data, 'base64');
}

async function main() {
  if (!API_KEY) {
    console.error('ERROR: GEMINI_API_KEY environment variable is not set.');
    console.error('FIX: export GEMINI_API_KEY=your-key && node scripts/generate-icons.mjs');
    console.error('');
    console.error('SVG fallback icons are already available in miniapp/src/components/icons/');
    process.exit(1);
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created directory: ${OUTPUT_DIR}`);
  }

  for (const [name, prompt] of Object.entries(PROMPTS)) {
    const filename = `${name}.png`;
    const filepath = join(OUTPUT_DIR, filename);

    console.log(`Generating ${filename}...`);
    try {
      const imageBuffer = await generateIcon(name, prompt);
      writeFileSync(filepath, imageBuffer);
      console.log(`  Saved: ${filepath} (${imageBuffer.length} bytes)`);
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
    }
  }

  console.log('\nDone. Icons saved to:', OUTPUT_DIR);
}

main();
