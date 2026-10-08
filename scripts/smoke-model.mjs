/**
 * @fileoverview Node smoke test for the local Kokoro narration chain.
 *
 * Verifies that the pinned model assets, kokoro-js, transformers.js, and
 * the espeak phonemizer work together offline: remote models are disabled
 * before anything loads, mirroring the extension's fetch guard.
 *
 * Usage: npm run smoke:model
 */

import {unlinkSync} from 'node:fs';
import {resolve} from 'node:path';

import {env} from '@huggingface/transformers';
import {KokoroTTS} from 'kokoro-js';

const SAMPLE_RATE = 24_000;

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = resolve('models/');

console.log('Loading Kokoro-82M (q8) from local models/ ...');
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', {
  dtype: 'q8',
});

const text =
  'Narrately reads your books locally, without sending a single word to any server.';
console.log('Synthesizing:', JSON.stringify(text));
const audio = await tts.generate(text, {voice: 'af_heart', speed: 1});

const samples = audio.audio.length;
const seconds = samples / SAMPLE_RATE;
if (samples <= 0 || !Number.isFinite(seconds)) {
  throw new Error('Synthesis produced no audible samples.');
}

const output = resolve('smoke-test-output.wav');
await audio.save(output);
console.log(
  `OK: ${samples} samples (${seconds.toFixed(2)} s @ ${SAMPLE_RATE} Hz) written to ${output}`,
);

// onnxruntime keeps worker threads alive after completion; exit explicitly.
if (process.env.CI) {
  unlinkSync(output);
}
process.exit(0);
