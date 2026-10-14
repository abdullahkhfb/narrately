/**
 * @fileoverview Content-side client for the hidden inference host iframe.
 */

import {browser, extensionUrl} from '../shared/browser';
import {isDebugErrorRecord} from '../shared/debugErrors';
import type {
  DebugErrorRecord,
  ModelStatusMessage,
  NarrateMessage,
  ProgressMessage,
  ResultMessage,
  StorageInfoMessage,
  WorkerMessage,
} from '../shared/messages';
import type {ClearTarget, StorageInfo} from '../shared/storageManager';

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
  modelInstalled(device: Device): Promise<boolean>;
  downloadModel(
    device: Device,
    onProgress: (progress: ProgressMessage) => void,
  ): Job<void>;
  warmup(device: Device): void;
  storageInfo(): Promise<StorageInfo>;
  clearStorage(target: ClearTarget): Promise<StorageInfo>;
}

type Reply = ResultMessage | ModelStatusMessage | StorageInfoMessage;

interface Listener {
  settle: (message: Reply) => void;
  reject: (error: Error) => void;
  onProgress: (progress: ProgressMessage) => void;
}

/** Creates a lazy job client that mounts the extension-origin host iframe on first use. */
export function createHostClient(): HostClient {
  let frame: HTMLIFrameElement | undefined;
  let loaded = false;
  const listeners = new Map<string, Listener>();

  const ensureFrame = (): HTMLIFrameElement => {
    if (frame) {
      return frame;
    }
    const created = document.createElement('iframe');
    created.src = extensionUrl('src/inference/host.html');
    created.setAttribute('aria-hidden', 'true');
    created.tabIndex = -1;
    created.dataset['narrately'] = 'host';
    created.style.cssText = 'display:none!important';
    created.addEventListener(
      'load',
      () => {
        loaded = true;
      },
      {once: true},
    );
    document.documentElement.appendChild(created);
    frame = created;
    return created;
  };

  window.addEventListener('message', (event: MessageEvent<WorkerMessage>) => {
    if (!frame || event.source !== frame.contentWindow) {
      return;
    }
    const message: unknown = event.data;
    if (isHostDebugErrorMessage(message)) {
      void browser.runtime
        .sendMessage({type: 'report_debug_error', error: message.error})
        .catch(() => {});
      return;
    }
    if (!isWorkerMessage(message) || !('jobId' in message) || !message.jobId) {
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
    } else if (
      message.type === 'result' ||
      message.type === 'model_status' ||
      message.type === 'storage_info'
    ) {
      listener.settle(message);
    }
  });

  function postToHost(payload: Record<string, unknown>): void {
    const targetFrame = ensureFrame();
    const send = (): void => {
      targetFrame.contentWindow?.postMessage(payload, '*');
    };
    if (loaded) {
      send();
    } else {
      targetFrame.addEventListener('load', send, {once: true});
    }
  }

  function call(
    body: Record<string, unknown>,
    onProgress: (progress: ProgressMessage) => void = () => {},
  ): Job<Reply> {
    const jobId = randomJobId();
    const promise = new Promise<Reply>((settle, reject) => {
      listeners.set(jobId, {settle, reject, onProgress});
      postToHost({...body, jobId});
    });
    return {
      promise,
      cancel() {
        frame?.contentWindow?.postMessage({type: 'cancel', jobId}, '*');
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
    async storageInfo() {
      return toStorageInfo(await call({type: 'storage_info'}).promise);
    },
    async clearStorage(target) {
      return toStorageInfo(await call({type: 'clear_storage', target}).promise);
    },
    warmup(device) {
      postToHost({type: 'warmup', device});
    },
    downloadModel(device, onProgress) {
      const job = call({type: 'model_download', device}, onProgress);
      return {cancel: job.cancel, promise: job.promise.then(() => undefined)};
    },
  };
}

function toStorageInfo(reply: Reply): StorageInfo {
  if (reply.type !== 'storage_info') {
    throw new Error('Unexpected host reply.');
  }
  return {
    chapterEntries: reply.chapterEntries,
    chapterBytes: reply.chapterBytes,
    modelBytes: reply.modelBytes,
  };
}

function isHostDebugErrorMessage(
  value: unknown,
): value is {type: 'narrately_debug_error'; error: DebugErrorRecord} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'narrately_debug_error' &&
    'error' in value &&
    isDebugErrorRecord(value.error)
  );
}

function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  switch (record['type']) {
    case 'ready':
      return Array.isArray(record['voices']);
    case 'progress':
      return (
        typeof record['jobId'] === 'string' &&
        typeof record['completed'] === 'number' &&
        typeof record['total'] === 'number' &&
        (record['phase'] === 'loading' ||
          record['phase'] === 'synthesizing' ||
          record['phase'] === 'merging' ||
          record['phase'] === 'done')
      );
    case 'result':
      return (
        typeof record['jobId'] === 'string' &&
        record['audio'] instanceof ArrayBuffer &&
        typeof record['durationMs'] === 'number'
      );
    case 'error':
      return (
        typeof record['message'] === 'string' &&
        (record['jobId'] === undefined || typeof record['jobId'] === 'string')
      );
    case 'debug_error':
      return isDebugErrorRecord(record['error']);
    case 'storage_info':
      return (
        typeof record['jobId'] === 'string' &&
        typeof record['chapterEntries'] === 'number' &&
        typeof record['chapterBytes'] === 'number' &&
        typeof record['modelBytes'] === 'number'
      );
    case 'model_status':
      return (
        typeof record['jobId'] === 'string' &&
        typeof record['installed'] === 'boolean'
      );
    default:
      return false;
  }
}

function randomJobId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
