/**
 * @fileoverview Serializes Kokoro jobs in a dedicated worker.
 */

import '../shared/webgpu';
import {installDebugErrorCapture} from '../shared/debugErrors';
import type {DebugErrorRecord, InferenceMessage, WorkerMessage} from '../shared/messages';
import {synthesizeLocal, warmupKokoro} from './kokoro';

let busy = Promise.resolve();
const cancelled = new Set<string>();

installDebugErrorCapture('inference worker', reportWorkerError);

function reportWorkerError(error: DebugErrorRecord): Promise<void> {
  post({type: 'debug_error', error});
  return Promise.resolve();
}

self.addEventListener('message', (event: MessageEvent<InferenceMessage>) => {
  const message = event.data;
  if (message.type === 'cancel') {
    cancelled.add(message.jobId);
    return;
  }
  busy = busy.then(() => handleMessage(message)).catch((error: unknown) => {
    console.error(`Inference worker could not handle "${message.type}":`, error);
    const jobId = message.type === 'synthesize' ? message.jobId : undefined;
    post({
      type: 'error',
      message: getErrorMessage(error),
      ...(jobId ? {jobId} : {}),
    });
  });
});

async function handleMessage(message: InferenceMessage): Promise<void> {
  switch (message.type) {
    case 'warmup':
      await warmupKokoro(message.device);
      post({type: 'ready', voices: []});
      return;
    case 'synthesize': {
      if (cancelled.delete(message.jobId)) {
        throw new Error('Narration cancelled.');
      }
      post({
        type: 'progress',
        jobId: message.jobId,
        completed: 0,
        total: 1,
        phase: 'synthesizing',
      });
      const result = await synthesizeLocal(
        message.text,
        message.voiceId,
        message.speed,
        message.device,
      );
      post(
        {
          type: 'result',
          jobId: message.jobId,
          audio: result.audio,
          durationMs: result.durationMs,
        },
        [result.audio],
      );
      post({
        type: 'progress',
        jobId: message.jobId,
        completed: 1,
        total: 1,
        phase: 'done',
      });
      return;
    }
    case 'cancel':
      return;
    default:
      return;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Inference failed.';
}

interface WorkerScope {
  postMessage(message: WorkerMessage, transfer?: Transferable[]): void;
}

function post(message: WorkerMessage, transfer: Transferable[] = []): void {
  const workerScope = self as unknown as WorkerScope;
  workerScope.postMessage(message, transfer);
}
