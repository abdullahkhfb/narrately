/**
 * @fileoverview Narration orchestration and local audio caching.
 */

import {cacheKey, splitText, validateRequest} from './rustCore';
import type {NarrationSettings} from '../shared/types';

interface CachedAudio {
  key: string;
  audio: ArrayBuffer;
  createdAt: number;
  durationMs: number;
}

export interface AudioChunk {
  audio: ArrayBuffer;
  durationMs: number;
}

export interface WorkerClient {
  synthesize(
    text: string,
    voiceId: string,
    speed: number,
  ): Promise<AudioChunk>;
}

const DATABASE_NAME = 'narrately';
const STORE_NAME = 'audio_cache';
const SAMPLE_RATE = 24_000;

export interface NarrationHooks {
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

/** Generates narration for a chapter, using the local cache when enabled. */
export async function narrateChapter(
  worker: WorkerClient,
  text: string,
  settings: NarrationSettings,
  hooks: NarrationHooks = {},
): Promise<AudioChunk> {
  await validateRequest(text, settings.voiceId, settings.speed);
  const chunks = await splitText(text);
  const outputs: AudioChunk[] = [];
  hooks.onProgress?.(0, chunks.length);

  for (const chunk of chunks) {
    // Chunks are the cancellation granularity; a running one finishes.
    hooks.signal?.throwIfAborted();
    const key = await cacheKey(chunk, settings.voiceId, settings.speed);
    const hit = settings.cacheEnabled ? await readCache(key) : undefined;
    if (hit) {
      outputs.push({audio: hit.audio, durationMs: hit.durationMs});
      hooks.onProgress?.(outputs.length, chunks.length);
      continue;
    }

    const result = await worker.synthesize(chunk, settings.voiceId, settings.speed);
    outputs.push(result);
    if (settings.cacheEnabled) {
      await writeCache({
        key,
        audio: result.audio,
        createdAt: Date.now(),
        durationMs: result.durationMs,
      });
    }
    hooks.onProgress?.(outputs.length, chunks.length);
  }

  return mergeWavChunks(outputs);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME, {keyPath: 'key'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open audio cache.'));
  });
}

function isCachedAudio(value: unknown): value is CachedAudio {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record['key'] === 'string' &&
    record['audio'] instanceof ArrayBuffer &&
    typeof record['createdAt'] === 'number' &&
    typeof record['durationMs'] === 'number'
  );
}

function readCache(key: string): Promise<CachedAudio | undefined> {
  return openDatabase().then((database) => {
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, 'readonly')
        .objectStore(STORE_NAME)
        .get(key);
      request.onsuccess = () => {
        const value: unknown = request.result;
        resolve(isCachedAudio(value) ? value : undefined);
      };
      request.onerror = () => {
        reject(request.error ?? new Error('Unable to read audio cache.'));
      };
    });
  });
}

function writeCache(entry: CachedAudio): Promise<void> {
  return openDatabase().then((database) => {
    return new Promise((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, 'readwrite')
        .objectStore(STORE_NAME)
        .put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => {
        reject(request.error ?? new Error('Unable to write audio cache.'));
      };
    });
  });
}

function mergeWavChunks(chunks: AudioChunk[]): AudioChunk {
  if (chunks.length === 0) {
    throw new Error('No audio was generated.');
  }
  if (chunks.length === 1) {
    const firstChunk = chunks[0];
    if (!firstChunk) {
      throw new Error('No audio was generated.');
    }
    return firstChunk;
  }

  const decoded = chunks.map((chunk) => parseWav(chunk.audio));
  const totalSamples = decoded.reduce(
    (sum, part) => sum + part.samples.length,
    0,
  );
  const samples = new Float32Array(totalSamples);
  let offset = 0;

  for (const part of decoded) {
    samples.set(part.samples, offset);
    offset += part.samples.length;
  }

  const sampleRate = decoded[0]?.sampleRate ?? SAMPLE_RATE;
  const audio = encodeWav(samples, sampleRate);
  return {
    audio,
    durationMs: Math.round((samples.length / sampleRate) * 1000),
  };
}

interface DecodedWav {
  samples: Float32Array;
  sampleRate: number;
}

function parseWav(buffer: ArrayBuffer): DecodedWav {
  const view = new DataView(buffer);
  const sampleRate = view.getUint32(24, true);
  const dataSize = view.getUint32(40, true);
  const sampleCount = dataSize / 2;
  const samples = new Float32Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = view.getInt16(44 + index * 2, true) / 32768;
  }

  return {samples, sampleRate};
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    view.setInt16(44 + index * 2, sample * 32767, true);
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index));
  }
}
