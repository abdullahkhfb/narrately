/**
 * @fileoverview Extension-origin bridge page embedded by the content script.
 *
 * Content scripts run with the page's origin, so they can neither start a
 * worker from an extension URL nor share an IndexedDB cache across sites.
 * This page owns the worker, the Rust/WASM core, and the audio cache.
 */

import {extensionUrl} from '../shared/extensionUrl';
import {narrateChapter, type AudioChunk, type WorkerClient} from '../core/narration';
import {downloadModel, isModelInstalled} from './modelStore';
import type {
  HostRequest,
  InferenceMessage,
  NarrateMessage,
  WorkerMessage,
} from '../shared/messages';

interface Pending {
  resolve: (chunk: AudioChunk) => void;
  reject: (error: Error) => void;
}

const worker = new Worker(extensionUrl('src/inference_worker.js'), {
  type: 'module',
});
const pending = new Map<string, Pending>();
const controllers = new Map<string, AbortController>();

worker.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;
  if (message.type === 'result') {
    pending.get(message.jobId)?.resolve({
      audio: message.audio,
      durationMs: message.durationMs,
    });
    pending.delete(message.jobId);
  } else if (message.type === 'error' && message.jobId) {
    pending.get(message.jobId)?.reject(new Error(message.message));
    pending.delete(message.jobId);
  }
});

worker.addEventListener('error', () => {
  for (const job of pending.values()) {
    job.reject(new Error('The inference worker crashed.'));
  }
  pending.clear();
});

const workerClient: WorkerClient = {
  synthesize(text, voiceId, speed) {
    const jobId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      pending.set(jobId, {resolve, reject});
      worker.postMessage({
        type: 'synthesize',
        jobId,
        text,
        voiceId,
        speed,
        device: currentDevice,
      } satisfies InferenceMessage);
    });
  },
};

// The device is fixed per narration request, so chunks share it.
let currentDevice: NarrateMessage['device'] = 'wasm';

window.addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.source !== window.parent || !isHostRequest(event.data)) {
    return;
  }
  if (event.data.type === 'cancel') {
    controllers.get(event.data.jobId)?.abort();
    return;
  }
  if (event.data.type === 'warmup') {
    worker.postMessage({type: 'warmup', device: event.data.device} satisfies InferenceMessage);
    return;
  }
  if (event.data.type === 'model_status') {
    const {jobId} = event.data;
    void isModelInstalled(event.data.device).then((installed) => {
      send({type: 'model_status', jobId, installed});
    });
    return;
  }
  if (event.data.type === 'model_download') {
    void runModelDownload(event.data.jobId, event.data.device);
    return;
  }
  void runNarration(event.data);
});

async function runModelDownload(
  jobId: string,
  device: NarrateMessage['device'],
): Promise<void> {
  const controller = new AbortController();
  controllers.set(jobId, controller);
  try {
    await downloadModel(
      device,
      ({fraction, loadedBytes, totalBytes}) => {
        send({
          type: 'progress',
          jobId,
          completed: Math.round(fraction * 1000),
          total: 1000,
          phase: 'loading',
          loadedBytes,
          totalBytes,
        });
      },
      controller.signal,
    );
    send({type: 'model_status', jobId, installed: true});
  } catch (error: unknown) {
    send({
      type: 'error',
      jobId,
      message: controller.signal.aborted
        ? 'Download cancelled.'
        : error instanceof Error
          ? error.message
          : 'Model download failed.',
    });
  } finally {
    controllers.delete(jobId);
  }
}

async function runNarration(request: NarrateMessage): Promise<void> {
  const controller = new AbortController();
  controllers.set(request.jobId, controller);
  currentDevice = request.device;

  try {
    const result = await narrateChapter(
      workerClient,
      request.text,
      {
        voiceId: request.voiceId,
        speed: request.speed,
        device: request.device,
        cacheEnabled: request.cacheEnabled,
      },
      {
        signal: controller.signal,
        onProgress: (completed, total) => {
          send({
            type: 'progress',
            jobId: request.jobId,
            completed,
            total,
            phase: completed < total ? 'synthesizing' : 'merging',
          });
        },
      },
    );
    send(
      {
        type: 'result',
        jobId: request.jobId,
        audio: result.audio,
        durationMs: result.durationMs,
      },
      [result.audio],
    );
  } catch (error: unknown) {
    send({
      type: 'error',
      jobId: request.jobId,
      message: error instanceof Error ? error.message : 'Narration failed.',
    });
  } finally {
    controllers.delete(request.jobId);
  }
}

function send(message: WorkerMessage, transfer: Transferable[] = []): void {
  window.parent.postMessage(message, '*', transfer);
}

function isHostRequest(message: unknown): message is HostRequest {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const type = (message as {type?: unknown}).type;
  return (
    type === 'narrate' ||
    type === 'cancel' ||
    type === 'model_status' ||
    type === 'model_download' ||
    type === 'warmup'
  );
}
