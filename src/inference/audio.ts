/**
 * @fileoverview WAV encoding helpers for Kokoro output.
 */

export const SAMPLE_RATE = 24_000;

const IS_LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

/** Encodes floating-point PCM samples as a mono 16-bit WAV file. */
export function float32ToWav(
  samples: Float32Array,
  sampleRate = SAMPLE_RATE,
): ArrayBuffer {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataBytes, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataBytes, true);

  if (IS_LITTLE_ENDIAN) {
    const pcm = new Int16Array(buffer, 44, samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      const raw = samples[i] as number;
      const clamped = raw < -1 ? -1 : raw > 1 ? 1 : raw;
      pcm[i] = Math.round(clamped * 32767);
    }
  } else {
    for (let i = 0; i < samples.length; i += 1) {
      const raw = samples[i] as number;
      const clamped = raw < -1 ? -1 : raw > 1 ? 1 : raw;
      view.setInt16(44 + i * 2, Math.round(clamped * 32767), true);
    }
  }

  return buffer;
}
