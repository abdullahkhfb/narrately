/**
 * @fileoverview Content-side client for the hidden inference host iframe.
 */

import {extensionUrl} from '../shared/browser';
import type {
  ModelStatusMessage,
  NarrateMessage,
  ProgressMessage,
  ResultMessage,
  WorkerMessage,
} from '../shared/messages';

type Device = NarrateMessage['device'];
export type NarrationRequest = Omit<NarrateMessage, 'type' | 'jobId'>;
export type NarrationResult = Pick<ResultMessage, 'audio' | 'durationMs'>;

export interface Job<T> {
  promise: Promise<T>;
  cancel(): void;
}
export type NarrationJob = Job<NarrationResult>;

export interface HostClient {
  narrate(
    request: NarrationRequest,
    onProgress: (progress: ProgressMessage) => void,
  ): NarrationJob;
  /** Resolves true when the voice model is available on this device. */
  modelInstalled(device: Device): Promise<boolean>;
  downloadModel(
    device: Device,
    onProgress: (progress: ProgressMessage) => void,
  ): Job<void>;
  /** Starts loading the model so the first narration begins sooner. */
  warmup(device: Device): void;
}

interface Listener {
  settle: (message: ResultMessage | ModelStatusMessage) => void;
  reject: (error: Error) => void;
  onProgress: (progress: ProgressMessage) => void;
}

/** Embeds the extension-origin host page and returns a job API for it. */
export function createHostClient(): HostClient {
  const frame = document.createElement('iframe');
  frame.src = extensionUrl('src/inference/host.html');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.dataset['narrately'] = 'host';
  frame.style.cssText = 'display:none!important';
  let loaded = false;
  frame.addEventListener('load', () => {
    loaded = true;
  }, {once: true});
  document.documentElement.appendChild(frame);

  const listeners = new Map<string, Listener>();

  window.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    if (event.source !== frame.contentWindow) {
      return;
    }
    const message = event.data;
    if (!('jobId' in message) || !message.jobId) {
      return;
    }
    const listener = listeners.get(message.jobId);
    if (!listener) {
      return;
    }
    if (message.type === 'progress') {
      listener.onProgress(message);
      return;
    }
    listeners.delete(message.jobId);
    if (message.type === 'error') {
      listener.reject(new Error(message.message));
    } else if (message.type === 'result' || message.type === 'model_status') {
      listener.settle(message);
    }
  });

  /** Sends one request and settles with the host's final reply. */
  function call(
    body: Record<string, unknown>,
    onProgress: (progress: ProgressMessage) => void = () => {},
  ): Job<ResultMessage | ModelStatusMessage> {
    const jobId = randomJobId();
    const promise = new Promise<ResultMessage | ModelStatusMessage>(
      (settle, reject) => {
        listeners.set(jobId, {settle, reject, onProgress});
        const post = (): void => {
          frame.contentWindow?.postMessage({...body, jobId}, '*');
        };
        // The frame is cross-origin, so its readiness is tracked via load.
        if (loaded) {
          post();
        } else {
          frame.addEventListener('load', post, {once: true});
        }
      },
    );
    return {
      promise,
      cancel() {
        frame.contentWindow?.postMessage({type: 'cancel', jobId}, '*');
      },
    };
  }

  return {
    narrate(request, onProgress) {
      const job = call({type: 'narrate', ...request}, onProgress);
      return {
        cancel: job.cancel,
        promise: job.promise.then((message) => {
          if (message.type !== 'result') {
            throw new Error('Unexpected host reply.');
          }
          return {audio: message.audio, durationMs: message.durationMs};
        }),
      };
    },
    async modelInstalled(device) {
      const reply = await call({type: 'model_status', device}).promise;
      return reply.type === 'model_status' && reply.installed;
    },
    warmup(device) {
      const post = (): void => {
        frame.contentWindow?.postMessage({type: 'warmup', device}, '*');
      };
      if (loaded) {
        post();
      } else {
        frame.addEventListener('load', post, {once: true});
      }
    },
    downloadModel(device, onProgress) {
      const job = call({type: 'model_download', device}, onProgress);
      return {cancel: job.cancel, promise: job.promise.then(() => undefined)};
    },
  };
}

function randomJobId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Plain-http pages expose a restricted crypto surface.
  return `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
