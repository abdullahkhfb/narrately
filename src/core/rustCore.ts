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

const WASM_URL = extensionUrl('src/wasm/pkg/narrately_core_bg.wasm');

let isReady = false;
let ready: Promise<unknown> | undefined;

async function ensureReady(): Promise<void> {
  if (isReady) {
    return;
  }
  ready ??= init({module_or_path: WASM_URL}).then(
    (output) => {
      isReady = true;
      return output;
    },
    (error: unknown) => {
      ready = undefined;
      throw error;
    },
  );
  await ready;
}

/** Splits narration text using the Rust chunker. */
export async function splitText(text: string, maxChars = 480): Promise<string[]> {
  if (!isReady) {
    await ensureReady();
  }
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
  if (!isReady) {
    await ensureReady();
  }
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
  if (!isReady) {
    await ensureReady();
  }
  return buildCacheKey(text, voiceId, speed);
}

/** Builds stable cache keys for a batch of chunks in a single synchronous pass. */
export async function cacheKeys(
  chunks: readonly string[],
  voiceId: string,
  speed: number,
): Promise<string[]> {
  if (!isReady) {
    await ensureReady();
  }
  const keys = new Array<string>(chunks.length);
  for (let i = 0; i < chunks.length; i += 1) {
    keys[i] = buildCacheKey(chunks[i] as string, voiceId, speed);
  }
  return keys;
}

/** Returns the voice catalog exposed by the Rust core. */
export async function voiceCatalog(): Promise<unknown[]> {
  if (!isReady) {
    await ensureReady();
  }
  const parsed: unknown = JSON.parse(defaultVoiceCatalog());
  if (!Array.isArray(parsed)) {
    throw new Error('Rust voice catalog returned invalid data.');
  }
  return parsed;
}

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) {
    return false;
  }
  for (let i = 0; i < value.length; i += 1) {
    if (typeof value[i] !== 'string') {
      return false;
    }
  }
  return true;
}
