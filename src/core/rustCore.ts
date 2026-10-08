/**
 * @fileoverview TypeScript boundary for the Rust/WASM core.
 */

import init, {
  build_cache_key as buildCacheKey,
  chunk_text as chunkText,
  default_voice_catalog as defaultVoiceCatalog,
  validate_synthesis_request as validateSynthesisRequest,
} from '../wasm/pkg/narrately_core.js';
import {extensionUrl} from '../shared/extensionUrl';

/** The WASM binary ships as a plain extension file at a known path. */
const WASM_URL = extensionUrl('src/wasm/pkg/narrately_core_bg.wasm');

let ready: Promise<unknown> | undefined;

async function ensureReady(): Promise<void> {
  ready ??= init({module_or_path: WASM_URL});
  await ready;
}

/** Splits narration text using the Rust chunker. */
export async function splitText(text: string, maxChars = 480): Promise<string[]> {
  await ensureReady();
  const parsed: unknown = JSON.parse(chunkText(text, maxChars));
  if (!isStringArray(parsed)) {
    throw new Error('Rust chunker returned invalid data.');
  }
  return parsed;
}

/** Validates a narration request in the Rust core. */
export async function validateRequest(
  text: string,
  voiceId: string,
  speed: number,
): Promise<void> {
  await ensureReady();
  const result = validateSynthesisRequest(text, voiceId, speed);
  if (result) {
    throw new Error(result);
  }
}

/** Builds a stable cache key in the Rust core. */
export async function cacheKey(
  text: string,
  voiceId: string,
  speed: number,
): Promise<string> {
  await ensureReady();
  return buildCacheKey(text, voiceId, speed);
}

/** Returns the voice catalog exposed by the Rust core. */
export async function voiceCatalog(): Promise<unknown[]> {
  await ensureReady();
  const parsed: unknown = JSON.parse(defaultVoiceCatalog());
  if (!Array.isArray(parsed)) {
    throw new Error('Rust voice catalog returned invalid data.');
  }
  return parsed;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
