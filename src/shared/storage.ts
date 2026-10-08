/**
 * @fileoverview Local settings storage.
 */

import {browser} from './browser';
import type {NarrationSettings} from './types';

const DEFAULT_SETTINGS: NarrationSettings = {
  voiceId: 'af_heart',
  speed: 1,
  device: 'wasm',
  cacheEnabled: true,
};

/** Reads settings from extension-local storage. */
export async function getSettings(): Promise<NarrationSettings> {
  const stored = await browser.storage.local.get('settings');
  const settings = stored['settings'];
  if (typeof settings !== 'object' || settings === null) {
    return {...DEFAULT_SETTINGS};
  }

  if (!isRecord(settings)) {
    return {...DEFAULT_SETTINGS};
  }

  return {
    voiceId: getString(settings['voiceId'], DEFAULT_SETTINGS.voiceId),
    speed: getNumber(settings['speed'], DEFAULT_SETTINGS.speed),
    device: getDevice(settings['device']),
    cacheEnabled: getBoolean(
      settings['cacheEnabled'],
      DEFAULT_SETTINGS.cacheEnabled,
    ),
  };
}

/** Writes settings to extension-local storage. */
export async function setSettings(settings: NarrationSettings): Promise<void> {
  await browser.storage.local.set({settings});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function getBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function getDevice(value: unknown): NarrationSettings['device'] {
  return value === 'webgpu' ? 'webgpu' : 'wasm';
}
