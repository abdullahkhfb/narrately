/**
 * @fileoverview Local Kokoro model loading and synthesis.
 */

import {env, LogLevel} from '@huggingface/transformers';
import {KokoroTTS} from 'kokoro-js';
// ONNX Runtime files shipped inside the extension; transformers.js would
// otherwise fetch them from a CDN, which the local-only guard blocks.
import ortFactoryUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url';
import {float32ToWav, SAMPLE_RATE} from './audio';
import {extensionUrl} from '../shared/extensionUrl';
import {matchCachedModelFile} from './modelStore';
import type {InferenceDevice} from '../shared/types';

const MODEL_ID = 'onnx-community/Kokoro-82M-ONNX';
const MODEL_PATH = 'models/onnx-community/Kokoro-82M-ONNX/';
const REMOTE_VOICE_PATH = /\/voices\/([a-z]{2}_[a-z_]+)\.bin(?:\?.*)?$/i;

type KokoroInstance = Awaited<ReturnType<typeof KokoroTTS.from_pretrained>>;
type KokoroVoiceId = Parameters<KokoroInstance['generate']>[1] extends
  | {voice?: infer Voice}
  | undefined
  ? Voice
  : never;

let instance: KokoroInstance | undefined;
let loadedDevice: InferenceDevice | undefined;
let fetchGuardInstalled = false;

function installLocalFetchGuard(): void {
  if (fetchGuardInstalled) {
    return;
  }

  const nativeFetch = globalThis.fetch.bind(globalThis);
  const guardedFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : input.toString();
    const cached = await matchCachedModelFile(url);
    if (cached) {
      return cached;
    }
    const voiceMatch = url.match(REMOTE_VOICE_PATH);

    if (voiceMatch) {
      return nativeFetch(
        extensionUrl(`${MODEL_PATH}voices/${voiceMatch[1]}.bin`),
        init,
      );
    }

    if (/^https?:\/\//i.test(url)) {
      throw new Error(`Blocked remote inference request: ${url}`);
    }

    return nativeFetch(input, init);
  };
  globalThis.fetch = guardedFetch;
  // transformers.js binds its own fetch at import time, so hook it too.
  env.fetch = guardedFetch;
  fetchGuardInstalled = true;
}

/** Loads Kokoro from extension-local model assets. */
export async function loadKokoro(
  device: InferenceDevice,
  onProgress: (value: number) => void,
): Promise<void> {
  if (instance && loadedDevice === device) {
    return;
  }
  instance = undefined;

  env.allowRemoteModels = false;
  // Kokoro's model type is not in the registry, so transformers warns about
  // falling back to a single-file model, which is exactly what Kokoro is.
  env.logLevel = LogLevel.ERROR;
  // Blob-URL factories would violate the extension CSP, so import directly.
  env.useWasmCache = false;
  const onnxWasm = env.backends.onnx.wasm;
  if (onnxWasm) {
    onnxWasm.wasmPaths = {
      mjs: extensionUrl(ortFactoryUrl.replace(/^\//, '')),
      wasm: extensionUrl(ortWasmUrl.replace(/^\//, '')),
    };
  }
  env.allowLocalModels = true;
  env.localModelPath = extensionUrl('models/');
  // Static import: Vite's dynamic-import preload helper needs `document`,
  // which workers lack.
  installLocalFetchGuard();
  const loaded = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: device === 'webgpu' ? 'fp32' : 'q8',
    device,
    progress_callback: (info: unknown) => {
      const progress = (info as {progress?: unknown}).progress;
      if (typeof progress === 'number') {
        onProgress(progress);
      }
    },
  });
  instance = loaded;
  loadedDevice = device;
}

/** Synthesizes audio without network access. */
export async function synthesizeLocal(
  text: string,
  voiceId: string,
  speed: number,
  device: InferenceDevice,
): Promise<{audio: ArrayBuffer; durationMs: number}> {
  await loadKokoro(device, () => {});
  if (!instance) {
    throw new Error('Kokoro failed to initialize.');
  }

  // Voice IDs are already validated against the curated catalog by the
  // Rust core, so the kokoro-js voice union can be restored safely.
  const result = await instance.generate(text, {
    voice: voiceId as KokoroVoiceId,
    speed,
  });
  const data = result.audio as Float32Array;
  const audio = float32ToWav(data, SAMPLE_RATE);

  return {
    audio,
    durationMs: Math.round((data.length / SAMPLE_RATE) * 1000),
  };
}
