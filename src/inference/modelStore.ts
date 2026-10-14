/**
 * @fileoverview On-device storage for the Kokoro model files.
 */

import {extensionUrl} from '../shared/extensionUrl';
import {MODEL_CACHE_NAME as CACHE_NAME} from '../shared/storageManager';

const REVISION = 'f46687f7e41512228ae953af24a11b2640ea0f22';
const REMOTE_BASE =
  (import.meta.env['VITE_MODEL_BASE'] as string | undefined) ??
  `https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/${REVISION}`;

export const MODEL_PATH = 'models/onnx-community/Kokoro-82M-ONNX/';

function cacheKeyFor(name: string): string {
  return `https://narrately.invalid/model/${name}`;
}

interface ModelFile {
  name: string;
  sha256?: string;
  weight: number;
}

export type Device = 'wasm' | 'webgpu';

const SMALL_FILES: readonly ModelFile[] = [
  {name: 'config.json', weight: 0.01},
  {name: 'tokenizer.json', weight: 0.02},
  {name: 'tokenizer_config.json', weight: 0.01},
];

function filesFor(device: Device): readonly ModelFile[] {
  const weights = {weight: 0.96};
  return [
    ...SMALL_FILES,
    device === 'webgpu'
      ? {name: 'onnx/model.onnx', ...weights}
      : {
          name: 'onnx/model_quantized.onnx',
          sha256: '0d55b15d4b735d61a21b0105136bc81b8768c4db94753193c19354fa863cd556',
          ...weights,
        },
  ];
}

export interface DownloadProgress {
  fraction: number;
  loadedBytes: number;
  totalBytes: number;
}

/** Returns the cached response for a local model URL, if downloaded. */
export async function matchCachedModelFile(url: string): Promise<Response | undefined> {
  const prefix = extensionUrl(MODEL_PATH);
  if (!url.startsWith(prefix)) {
    return undefined;
  }
  const name = url.slice(prefix.length).split('?')[0] ?? '';
  return (await caches.open(CACHE_NAME)).match(cacheKeyFor(name));
}

/** True when every model file is either cached or bundled with the build. */
export async function isModelInstalled(device: Device): Promise<boolean> {
  const cache = await caches.open(CACHE_NAME);
  for (const file of filesFor(device)) {
    if (await cache.match(cacheKeyFor(file.name))) {
      continue;
    }
    try {
      const bundled = await fetch(extensionUrl(MODEL_PATH + file.name), {
        method: 'HEAD',
      });
      if (!bundled.ok) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

/** Downloads and verifies the model; resolves once all files are cached. */
export async function downloadModel(
  device: Device,
  onProgress: (progress: DownloadProgress) => void,
  signal: AbortSignal,
): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  let done = 0;

  for (const file of filesFor(device)) {
    const key = cacheKeyFor(file.name);
    if (await cache.match(key)) {
      done += file.weight;
      onProgress({fraction: done, loadedBytes: 0, totalBytes: 0});
      continue;
    }

    const response = await fetch(`${REMOTE_BASE}/${file.name}`, {signal});
    if (!response.ok || !response.body) {
      throw new Error(`Model download failed (${response.status}) for ${file.name}.`);
    }
    const totalBytes = Number(response.headers.get('content-length')) || 0;
    const parts: Uint8Array[] = [];
    let loadedBytes = 0;

    const reader = response.body.getReader();
    for (;;) {
      const {done: finished, value} = await reader.read();
      if (finished) {
        break;
      }
      parts.push(value);
      loadedBytes += value.length;
      const within = totalBytes ? loadedBytes / totalBytes : 0;
      onProgress({fraction: done + file.weight * within, loadedBytes, totalBytes});
    }

    const blob = new Blob(parts as BlobPart[]);
    // Free chunk references before checksum allocation.
    parts.length = 0;

    if (!file.sha256 && totalBytes && blob.size !== totalBytes) {
      throw new Error(`Incomplete download for ${file.name}; please retry.`);
    }
    if (file.sha256 && (await sha256Hex(blob)) !== file.sha256) {
      throw new Error(`Checksum mismatch for ${file.name}; the download was discarded.`);
    }
    await cache.put(
      key,
      new Response(blob, {headers: {'content-type': contentTypeFor(file.name)}}),
    );
    done += file.weight;
  }
  onProgress({fraction: 1, loadedBytes: 0, totalBytes: 0});
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += (bytes[i] as number).toString(16).padStart(2, '0');
  }
  return hex;
}

function contentTypeFor(name: string): string {
  return name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
}
