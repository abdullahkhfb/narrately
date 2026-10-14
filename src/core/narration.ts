/**
 * @fileoverview Narration orchestration and local audio caching.
 */

import {cacheKeys, splitText, validateRequest} from './rustCore';
import {
  AUDIO_STORE_NAME as STORE_NAME,
  openAudioDatabase as openDatabase,
} from '../shared/storageManager';
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
    signal?: AbortSignal,
  ): Promise<AudioChunk>;
}

const LOOKAHEAD = 2;
const WAV_HEADER_BYTES = 44;

export interface NarrationHooks {
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

interface SynthesisJob {
  text: string;
  key: string | undefined;
  indices: number[];
}

interface InflightJob {
  key: string | undefined;
  indices: number[];
  promise: Promise<AudioChunk>;
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
  const total = chunks.length;
  const outputs = new Array<AudioChunk | undefined>(total);
  let completed = 0;
  hooks.onProgress?.(0, total);

  // Group identical chunks upfront to avoid duplicate hashing, cache reads, and synthesis.
  const indicesByChunk = new Map<string, number[]>();
  for (let index = 0; index < total; index += 1) {
    const chunk = chunks[index] as string;
    const group = indicesByChunk.get(chunk);
    if (group) {
      group.push(index);
    } else {
      indicesByChunk.set(chunk, [index]);
    }
  }

  const uniqueChunks = Array.from(indicesByChunk.keys());
  const jobs: SynthesisJob[] = [];
  const database = settings.cacheEnabled ? await openDatabase() : undefined;

  try {
    if (database && uniqueChunks.length > 0) {
      const uniqueKeys = await cacheKeys(
        uniqueChunks,
        settings.voiceId,
        settings.speed,
      );
      const hits = await readCacheMany(database, uniqueKeys);

      for (let i = 0; i < uniqueChunks.length; i += 1) {
        const chunkText = uniqueChunks[i] as string;
        const indices = indicesByChunk.get(chunkText) as number[];
        const hit = hits[i];
        if (hit) {
          const cachedChunk: AudioChunk = {
            audio: hit.audio,
            durationMs: hit.durationMs,
          };
          for (const index of indices) {
            outputs[index] = cachedChunk;
          }
          completed += indices.length;
        } else {
          jobs.push({
            text: chunkText,
            key: uniqueKeys[i],
            indices,
          });
        }
      }
      if (completed > 0) {
        hooks.onProgress?.(completed, total);
      }
    } else {
      for (const [chunkText, indices] of indicesByChunk.entries()) {
        jobs.push({text: chunkText, key: undefined, indices});
      }
    }

    const writes: Promise<void>[] = [];
    const inflight: InflightJob[] = [];
    let inflightHead = 0;
    let nextJob = 0;

    const refill = (): void => {
      while (inflight.length - inflightHead < LOOKAHEAD && nextJob < jobs.length) {
        const job = jobs[nextJob] as SynthesisJob;
        nextJob += 1;
        const promise = worker.synthesize(
          job.text,
          settings.voiceId,
          settings.speed,
          hooks.signal,
        );
        promise.catch(() => undefined);
        inflight.push({key: job.key, indices: job.indices, promise});
      }
    };

    refill();
    while (inflightHead < inflight.length) {
      hooks.signal?.throwIfAborted();
      const job = inflight[inflightHead] as InflightJob;
      inflightHead += 1;
      const result = await job.promise;
      for (const index of job.indices) {
        outputs[index] = result;
      }
      completed += job.indices.length;
      refill();
      hooks.onProgress?.(completed, total);
      if (database && job.key) {
        writes.push(
          writeCache(database, {
            key: job.key,
            audio: result.audio,
            createdAt: Date.now(),
            durationMs: result.durationMs,
          }).catch((error: unknown) => {
            console.warn('Could not cache a chunk:', error);
          }),
        );
      }
    }

    const merged = mergeWavChunks(outputs);
    await Promise.all(writes);
    return merged;
  } finally {
    database?.close();
  }
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

function readCacheMany(
  database: IDBDatabase,
  keys: readonly string[],
): Promise<(CachedAudio | undefined)[]> {
  return new Promise((resolve, reject) => {
    const results = new Array<CachedAudio | undefined>(keys.length);
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    for (let index = 0; index < keys.length; index += 1) {
      const request = store.get(keys[index] as string);
      request.onsuccess = () => {
        const value: unknown = request.result;
        results[index] = isCachedAudio(value) ? value : undefined;
      };
    }
    transaction.oncomplete = () => resolve(results);
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Unable to read audio cache.'));
    };
    transaction.onabort = transaction.onerror;
  });
}

function writeCache(database: IDBDatabase, entry: CachedAudio): Promise<void> {
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
}

function mergeWavChunks(chunks: readonly (AudioChunk | undefined)[]): AudioChunk {
  const first = chunks[0];
  if (!first) {
    throw new Error('No audio was generated.');
  }
  if (chunks.length === 1) {
    return first;
  }

  const sizes = new Uint32Array(chunks.length);
  let totalBytes = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    if (!chunk) {
      throw new Error('A chunk was not generated.');
    }
    const view = new DataView(chunk.audio);
    if (
      chunk.audio.byteLength < WAV_HEADER_BYTES ||
      view.getUint32(0, false) !== 0x52494646
    ) {
      throw new Error('Unexpected audio data — could not merge chunks.');
    }
    const size = Math.min(
      view.getUint32(40, true),
      chunk.audio.byteLength - WAV_HEADER_BYTES,
    );
    sizes[i] = size;
    totalBytes += size;
  }

  const out = new Uint8Array(WAV_HEADER_BYTES + totalBytes);
  out.set(new Uint8Array(first.audio, 0, WAV_HEADER_BYTES), 0);
  const header = new DataView(out.buffer);
  header.setUint32(4, 36 + totalBytes, true);
  header.setUint32(40, totalBytes, true);
  const sampleRate = header.getUint32(24, true);

  let offset = WAV_HEADER_BYTES;
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i] as AudioChunk;
    const size = sizes[i] as number;
    out.set(new Uint8Array(chunk.audio, WAV_HEADER_BYTES, size), offset);
    offset += size;
  }

  return {
    audio: out.buffer,
    durationMs: Math.round((totalBytes / 2 / sampleRate) * 1000),
  };
}
