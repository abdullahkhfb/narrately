/**
 * @fileoverview Messages exchanged between extension contexts.
 */

import type {NarrationSettings} from './types';

export interface DebugErrorRecord {
  timestamp: string;
  source: string;
  message: string;
  level?: 'error' | 'warning';
  stack?: string;
  location?: string;
}

export interface GetSettingsMessage {
  type: 'get_settings';
}

export interface SetSettingsMessage {
  type: 'set_settings';
  settings: NarrationSettings;
}

export interface GetVoiceCatalogMessage {
  type: 'get_voice_catalog';
}

export interface OpenPanelMessage {
  type: 'open_panel';
}

export interface ReportDebugErrorMessage {
  type: 'report_debug_error';
  error: DebugErrorRecord;
}

export interface GetDebugErrorsMessage {
  type: 'get_debug_errors';
}

export type BackgroundMessage =
  | GetSettingsMessage
  | SetSettingsMessage
  | GetVoiceCatalogMessage
  | OpenPanelMessage
  | ReportDebugErrorMessage
  | GetDebugErrorsMessage;

export interface SynthesizeMessage {
  type: 'synthesize';
  jobId: string;
  text: string;
  voiceId: string;
  speed: number;
  device: 'wasm' | 'webgpu';
}

export interface CancelMessage {
  type: 'cancel';
  jobId: string;
}

export interface WarmupMessage {
  type: 'warmup';
  device: 'wasm' | 'webgpu';
}

/** Content script -> host page: narrate a whole chapter. */
export interface NarrateMessage {
  type: 'narrate';
  jobId: string;
  text: string;
  voiceId: string;
  speed: number;
  device: 'wasm' | 'webgpu';
  cacheEnabled: boolean;
}

/** Content script -> host page: is the voice model on this device? */
export interface ModelStatusRequest {
  type: 'model_status';
  jobId: string;
  device: 'wasm' | 'webgpu';
}

/** Content script -> host page: download the voice model. */
export interface ModelDownloadRequest {
  type: 'model_download';
  jobId: string;
  device: 'wasm' | 'webgpu';
}

/** Content script -> host page: load the model ahead of the first request. */
export interface WarmupRequest {
  type: 'warmup';
  device: 'wasm' | 'webgpu';
}

export type HostRequest =
  | NarrateMessage
  | CancelMessage
  | ModelStatusRequest
  | ModelDownloadRequest
  | WarmupRequest;

export type InferenceMessage =
  | SynthesizeMessage
  | CancelMessage
  | WarmupMessage;

export interface ReadyMessage {
  type: 'ready';
  voices: string[];
}

export interface ProgressMessage {
  type: 'progress';
  jobId: string;
  completed: number;
  total: number;
  phase: 'loading' | 'synthesizing' | 'merging' | 'done';
  /** Model download only: bytes of the current file received / expected. */
  loadedBytes?: number;
  totalBytes?: number;
}

export interface ResultMessage {
  type: 'result';
  jobId: string;
  audio: ArrayBuffer;
  durationMs: number;
}

export interface ErrorMessage {
  type: 'error';
  jobId?: string;
  message: string;
}

export interface DebugErrorMessage {
  type: 'debug_error';
  error: DebugErrorRecord;
}

/** Host -> content script: model availability (also ends a download). */
export interface ModelStatusMessage {
  type: 'model_status';
  jobId: string;
  installed: boolean;
}

export type WorkerMessage =
  | ModelStatusMessage
  | ReadyMessage
  | ProgressMessage
  | ResultMessage
  | ErrorMessage
  | DebugErrorMessage;
