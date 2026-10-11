/**
 * @fileoverview Narration orchestration and local audio caching.
 */

import {cacheKey, splitText, validateRequest} from './rustCore';
import {AUDIO_STORE_NAME as STORE_NAME, openAudioDatabase as openDatabase} from '../shared/storageManager';
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
  /** `signal` lets queued (not yet started) chunks be dropped on cancel. */
  synthesize(
    text: string,
    voiceId: string,
    speed: number,
    signal?: AbortSignal,
  ): Promise<AudioChunk>;
}

/**
 * Chunks kept queued in the inference worker. With one, the GPU sits idle
 * for the message round trip (and host-side cache write) between chunks;
 * with two, the next chunk is always ready the instant the previous ends.
 * The worker serializes jobs, so this adds no GPU contention.
 */
const LOOKAHEAD = 2;

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
  const total = chunks.length;
  const outputs: (AudioChunk | undefined)[] = new Array<AudioChunk | undefined>(total);
  let completed = 0;
  hooks.onProgress?.(0, total);

  // Keys and cache lookups happen up front, in parallel, in one read
  // transaction, instead of one awaited round trip per chunk.
  const keys = await Promise.all(
    chunks.map((chunk) => cacheKey(chunk, settings.voiceId, settings.speed)),
  );
  const hits = settings.cacheEnabled
    ? await readCacheMany(keys)
    : new Array<CachedAudio | undefined>(total).fill(undefined);

  // Identical chunks (repeated lines such as "...") are synthesized once.
  const missesByKey = new Map<string, number[]>();
  for (let index = 0; index < total; index += 1) {
    const hit = hits[index];
    if (hit) {
      outputs[index] = {audio: hit.audio, durationMs: hit.durationMs};
      completed += 1;
      continue;
    }
    const key = keys[index] as string;
    const group = missesByKey.get(key);
    if (group) {
      group.push(index);
    } else {
      missesByKey.set(key, [index]);
    }
  }
  if (completed > 0) {
    hooks.onProgress?.(completed, total);
  }

  const jobs = Array.from(missesByKey.entries());
  const writes: Promise<void>[] = [];
  const inflight: {key: string; indices: number[]; promise: Promise<AudioChunk>}[] = [];
  let next = 0;

  const refill = (): void => {
    while (inflight.length < LOOKAHEAD && next < jobs.length) {
      const [key, indices] = jobs[next] as [string, number[]];
      next += 1;
      const promise = worker.synthesize(
        chunks[indices[0] as number] as string,
        settings.voiceId,
        settings.speed,
        hooks.signal,
      );
      // A queued job that is cancelled rejects after we've already thrown.
      promise.catch(() => undefined);
      inflight.push({key, indices, promise});
    }
  };

  refill();
  while (inflight.length > 0) {
    // Chunks are the cancellation granularity; a running one finishes.
    hooks.signal?.throwIfAborted();
    const job = inflight.shift();
    if (!job) {
      break;
    }
    const result = await job.promise;
    for (const index of job.indices) {
      outputs[index] = result;
    }
    completed += job.indices.length;
    refill(); // keep the GPU fed before doing any bookkeeping
    hooks.onProgress?.(completed, total);
    if (settings.cacheEnabled) {
      // Fire and forget: the GPU must not wait on IndexedDB.
      writes.push(
        writeCache({
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

  const merged = mergeWavChunks(
    outputs.map((chunk) => {
      if (!chunk) {
        throw new Error('A chunk was not generated.');
      }
      return chunk;
    }),
  );
  await Promise.all(writes);
  return merged;
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

function readCacheMany(keys: string[]): Promise<(CachedAudio | undefined)[]> {
  return openDatabase().then((database) => {
    return new Promise((resolve, reject) => {
      const results = new Array<CachedAudio | undefined>(keys.length).fill(undefined);
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      keys.forEach((key, index) => {
        const request = store.get(key);
        request.onsuccess = () => {
          const value: unknown = request.result;
          results[index] = isCachedAudio(value) ? value : undefined;
        };
      });
      transaction.oncomplete = () => resolve(results);
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('Unable to read audio cache.'));
      };
      transaction.onabort = transaction.onerror;
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

/**
 * Chunks are always 44-byte-header, 16-bit mono PCM WAVs at one sample rate
 * (our own encoder wrote them), so merging is a straight byte concatenation
 * of the data sections plus a rewritten header: no float conversion, and
 * bit-exact with what was synthesized.
 */
const WAV_HEADER_BYTES = 44;

function mergeWavChunks(chunks: AudioChunk[]): AudioChunk {
  const first = chunks[0];
  if (!first) {
    throw new Error('No audio was generated.');
  }
  if (chunks.length === 1) {
    return first;
  }

  const views = chunks.map((chunk) => {
    const view = new DataView(chunk.audio);
    if (chunk.audio.byteLength < WAV_HEADER_BYTES || view.getUint32(0, false) !== 0x52494646) {
      throw new Error('Unexpected audio data — could not merge chunks.');
    }
    const size = Math.min(view.getUint32(40, true), chunk.audio.byteLength - WAV_HEADER_BYTES);
    return {chunk, size};
  });
  const totalBytes = views.reduce((sum, part) => sum + part.size, 0);

  const out = new Uint8Array(WAV_HEADER_BYTES + totalBytes);
  out.set(new Uint8Array(first.audio, 0, WAV_HEADER_BYTES), 0);
  const header = new DataView(out.buffer);
  header.setUint32(4, 36 + totalBytes, true);
  header.setUint32(40, totalBytes, true);
  const sampleRate = header.getUint32(24, true);

  let offset = WAV_HEADER_BYTES;
  for (const {chunk, size} of views) {
    out.set(new Uint8Array(chunk.audio, WAV_HEADER_BYTES, size), offset);
    offset += size;
  }

  return {
    audio: out.buffer,
    durationMs: Math.round((totalBytes / 2 / sampleRate) * 1000),
  };
}
