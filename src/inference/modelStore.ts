/**
 * @fileoverview On-device storage for the Kokoro model files.
 *
 * Files are downloaded once from a pinned Hugging Face revision into the
 * extension origin's Cache API, keyed by the same URL the model loader asks
 * for. Builds that bundle the files under `models/` work without a download.
 */

import {extensionUrl} from '../shared/extensionUrl';

const REVISION = 'f46687f7e41512228ae953af24a11b2640ea0f22';
const REMOTE_BASE =
  (import.meta.env['VITE_MODEL_BASE'] as string | undefined) ??
  `https://huggingface.co/onnx-community/Kokoro-82M-ONNX/resolve/${REVISION}`;

export const MODEL_PATH = 'models/onnx-community/Kokoro-82M-ONNX/';
const CACHE_NAME = 'narrately-model-v1';

/** The Cache API rejects chrome-extension:// keys, so files are stored
 * under a synthetic https key derived from the model-relative path. */
function cacheKeyFor(name: string): string {
  return `https://narrately.invalid/model/${name}`;
}

interface ModelFile {
  name: string;
  sha256?: string;
  /** Share of the overall progress bar (the ONNX file dominates). */
  weight: number;
}

export type Device = 'wasm' | 'webgpu';

const SMALL_FILES: readonly ModelFile[] = [
  {name: 'config.json', weight: 0.01},
  {name: 'tokenizer.json', weight: 0.02},
  {name: 'tokenizer_config.json', weight: 0.01},
];

/** WASM uses the 8-bit model; WebGPU needs the full-precision one. */
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
  /** 0..1 across all files. */
  fraction: number;
  /** Bytes received for the file currently downloading. */
  loadedBytes: number;
  /** Size of that file, or 0 when the server did not report it. */
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
    if (!file.sha256 && totalBytes && blob.size !== totalBytes) {
      throw new Error(`Incomplete download for ${file.name}; please retry.`);
    }
    if (file.sha256 && (await sha256Hex(blob)) !== file.sha256) {
      throw new Error(`Checksum mismatch for ${file.name}; the download was discarded.`);
    }
    // Stored only after verification, so a partial file is never served.
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
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function contentTypeFor(name: string): string {
  return name.endsWith('.json') ? 'application/json' : 'application/octet-stream';
}
