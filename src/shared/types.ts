/**
 * @fileoverview Shared domain types for the extension.
 */

export type OutputFormat = 'wav';
export type InferenceDevice = 'wasm' | 'webgpu';
export type VoiceKind = 'preset' | 'local_embedding';

/** Which site adapter produced a book. Add a member per supported site. */
export type SiteId = 'lnori' | 'cyrisia' | 'novelarchive' | 'generic';

export interface VoiceProfile {
  /** Stable model voice identifier. */
  id: string;
  /** Display name shown in the UI. */
  name: string;
  /** Short narration description. */
  description: string;
  /** BCP 47 language tag. */
  language: string;
  /** Voice implementation type. */
  kind: VoiceKind;
  /** Optional local embedding path. */
  assetPath?: string;
}

export interface NarrationSettings {
  /** Selected voice identifier. */
  voiceId: string;
  /** Playback speed multiplier. */
  speed: number;
  /** Local inference backend. */
  device: InferenceDevice;
  /** Whether generated chunks may be cached. */
  cacheEnabled: boolean;
}

export interface Chapter {
  /** Stable chapter identifier. */
  id: string;
  /** Display title. */
  title: string;
  /** Clean narration text. */
  text: string;
  /** Source element on the page. */
  element: Element;
}

export interface Book {
  /** Detected book title. */
  title: string;
  /** Chapters available to narrate. */
  chapters: Chapter[];
  /** Site adapter that produced this book. */
  source: SiteId;
}
