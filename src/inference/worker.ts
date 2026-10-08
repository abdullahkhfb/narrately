/**
 * @fileoverview Serializes Kokoro jobs in a dedicated worker.
 */

import {loadKokoro, synthesizeLocal} from './kokoro';
import type {InferenceMessage, WorkerMessage} from '../shared/messages';

let busy = Promise.resolve();

self.addEventListener('message', (event: MessageEvent<InferenceMessage>) => {
  const message = event.data;
  busy = busy.then(() => handleMessage(message)).catch((error: unknown) => {
    // Without the job id the host could never settle the pending request.
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
      await loadKokoro(message.device, () => {});
      post({type: 'ready', voices: []});
      return;
    case 'synthesize': {
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
  // The DOM lib types `self` as Window outside a dedicated worker build.
  const workerScope = self as unknown as WorkerScope;
  workerScope.postMessage(message, transfer);
}
