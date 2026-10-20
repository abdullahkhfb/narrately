/**
 * @fileoverview Local Kokoro model loading and synthesis.
 */

import { installWebGpuAdapterPatch } from '../shared/webgpu';
import {env, LogLevel} from '@huggingface/transformers';
import {KokoroTTS} from 'kokoro-js';
import ortFactoryUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.mjs?url';
import ortWasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.asyncify.wasm?url';
import {extensionUrl} from '../shared/extensionUrl';
import type {InferenceDevice} from '../shared/types';
import {float32ToWav, SAMPLE_RATE} from './audio';
import {matchCachedModelFile} from './modelStore';

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

installWebGpuAdapterPatch();

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
  env.fetch = guardedFetch;
  fetchGuardInstalled = true;
}

/** Asks WebGPU for the high-performance adapter and tells ONNX Runtime to use it. */
async function selectHighPerformanceAdapter(): Promise<void> {
  const nav = navigator as Navigator & {
    gpu?: {requestAdapter(options?: Record<string, unknown>): Promise<unknown>};
  };
  const webgpuEnv = env.backends.onnx.webgpu as
    | {powerPreference?: string; adapter?: unknown}
    | undefined;
  if (!webgpuEnv || !nav.gpu) {
    return;
  }
  webgpuEnv.powerPreference = 'high-performance';
  try {
    const adapter = (await nav.gpu.requestAdapter({
      powerPreference: 'high-performance',
    })) as {info?: Record<string, unknown>} | null;
    if (adapter) {
      webgpuEnv.adapter = adapter;
      const info = adapter.info ?? {};
      console.warn(
        `[narrately] WebGPU adapter: ${String(info.vendor ?? '?')} ${String(info.architecture ?? '')} ${String(info.description ?? info.device ?? '')}`.trim(),
      );
    }
  } catch (error: unknown) {
    console.warn('[narrately] Could not pre-select a WebGPU adapter:', error);
  }
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

  installWebGpuAdapterPatch();
  env.allowRemoteModels = false;
  env.logLevel = LogLevel.ERROR;
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
  installLocalFetchGuard();
  if (device === 'webgpu') {
    await selectHighPerformanceAdapter();
  }
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

/**
 * Drops the current engine so the next call rebuilds it. A lost WebGPU device
 * (e.g. out of memory) leaves the ONNX session permanently invalid, and
 * `loadKokoro` would otherwise keep reusing it.
 */
async function resetEngine(): Promise<void> {
  const broken = instance as unknown as
    | {model?: {dispose?: () => Promise<void> | void}}
    | undefined;
  instance = undefined;
  loadedDevice = undefined;
  try {
    await broken?.model?.dispose?.();
  } catch {
    // The device is already lost; releasing the session is best effort.
  }
}

const WARMUP_TEXTS = [
  'Hello there.',
  'The quick brown fox jumped over the lazy dog, and then, after a long pause, ' +
    'she asked whether anyone had seen the old lighthouse keeper since the storm.',
];

/** Loads the model and, on WebGPU, runs two warmup inferences to precompile shaders. */
export async function warmupKokoro(
  device: InferenceDevice,
  voiceId = 'af_heart',
): Promise<void> {
  await loadKokoro(device, () => {});
  if (device !== 'webgpu' || !instance) {
    return;
  }
  try {
    for (const text of WARMUP_TEXTS) {
      await instance.generate(text, {voice: voiceId as KokoroVoiceId, speed: 1});
    }
  } catch (error: unknown) {
    console.warn('Kokoro warmup run failed:', error);
    await resetEngine();
  }
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

  const started = performance.now();
  let result: Awaited<ReturnType<KokoroInstance['generate']>>;
  try {
    result = await instance.generate(text, {
      voice: voiceId as KokoroVoiceId,
      speed,
    });
  } catch (error: unknown) {
    await resetEngine();
    if (device !== 'webgpu') {
      throw error;
    }
    // The GPU device was lost. Rebuild the engine on a fresh device and retry
    // this chunk once; later chunks then run normally.
    console.warn('WebGPU inference failed; reloading engine and retrying:', error);
    await loadKokoro(device, () => {});
    if (!instance) {
      throw error;
    }
    result = await instance.generate(text, {
      voice: voiceId as KokoroVoiceId,
      speed,
    });
  }
  const data = result.audio as Float32Array;
  const audio = float32ToWav(data, SAMPLE_RATE);
  const elapsed = performance.now() - started;
  console.info(
    `[narrately] ${device}: ${text.length} chars -> ${(data.length / SAMPLE_RATE).toFixed(1)} s audio in ${Math.round(elapsed)} ms (${((data.length / SAMPLE_RATE) / (elapsed / 1000)).toFixed(1)}x realtime)`,
  );

  return {
    audio,
    durationMs: Math.round((data.length / SAMPLE_RATE) * 1000),
  };
}
