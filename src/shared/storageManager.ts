/**
 * @fileoverview Inspect and clear what Narrately keeps on this device:
 * generated chapter audio (IndexedDB) and the downloaded voice model
 * (Cache API). Both live in the extension origin, so this module works from
 * the popup and from the inference host page alike.
 */

export const AUDIO_DATABASE_NAME = 'narrately';
export const AUDIO_STORE_NAME = 'audio_cache';
export const MODEL_CACHE_NAME = 'narrately-model-v1';

export type ClearTarget = 'chapters' | 'model' | 'all';

export interface StorageInfo {
  /** Cached audio chunks (a chapter is usually several chunks). */
  chapterEntries: number;
  chapterBytes: number;
  modelBytes: number;
}

/** Opens (creating if needed) the audio cache database. */
export function openAudioDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIO_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(AUDIO_STORE_NAME, {keyPath: 'key'});
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open audio cache.'));
  });
}

/** Counts cached audio chunks and their total size. */
async function readChapterUsage(): Promise<Pick<StorageInfo, 'chapterEntries' | 'chapterBytes'>> {
  const database = await openAudioDatabase();
  try {
    return await new Promise((resolve, reject) => {
      let chapterEntries = 0;
      let chapterBytes = 0;
      const request = database
        .transaction(AUDIO_STORE_NAME, 'readonly')
        .objectStore(AUDIO_STORE_NAME)
        .openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve({chapterEntries, chapterBytes});
          return;
        }
        const value: unknown = cursor.value;
        const audio = (value as {audio?: unknown} | null)?.audio;
        chapterEntries += 1;
        chapterBytes += audio instanceof ArrayBuffer ? audio.byteLength : 0;
        cursor.continue();
      };
      request.onerror = () =>
        reject(request.error ?? new Error('Unable to read audio cache.'));
    });
  } finally {
    database.close();
  }
}

async function readModelBytes(): Promise<number> {
  if (!(await caches.has(MODEL_CACHE_NAME))) {
    return 0;
  }
  const cache = await caches.open(MODEL_CACHE_NAME);
  let total = 0;
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    total += response ? (await response.blob()).size : 0;
  }
  return total;
}

/** Reports how much space chapters and the voice model currently use. */
export async function getStorageInfo(): Promise<StorageInfo> {
  const [chapters, modelBytes] = await Promise.all([
    readChapterUsage(),
    readModelBytes(),
  ]);
  return {...chapters, modelBytes};
}

async function clearChapters(): Promise<void> {
  const database = await openAudioDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(AUDIO_STORE_NAME, 'readwrite');
      transaction.objectStore(AUDIO_STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Unable to clear cached chapters.'));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('Clearing cached chapters was interrupted.'));
    });
  } finally {
    database.close();
  }
}

async function clearModel(): Promise<void> {
  await caches.delete(MODEL_CACHE_NAME);
}

/**
 * Deletes the chosen data in one step and returns the updated usage.
 *
 * - `chapters`: only the cached narration audio (the `audio_cache` store).
 *   The voice model is never touched, so narration keeps working offline.
 * - `model`: only the downloaded voice model; cached chapters stay.
 * - `all`: both.
 */
export async function clearStorage(target: ClearTarget): Promise<StorageInfo> {
  if (target === 'chapters' || target === 'all') {
    await clearChapters();
  }
  if (target === 'model' || target === 'all') {
    await clearModel();
  }
  return getStorageInfo();
}

/** "12.4 MB", "820 KB", "0 KB" — sizes the way people read them. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) {
    return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  }
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(bytes >= 104_857_600 ? 0 : 1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
}
