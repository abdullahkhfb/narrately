/**
 * @fileoverview Background entry point for settings, downloads, and
 * catalog requests.
 */

import {browser} from '../shared/browser';
import {getSettings, setSettings} from '../shared/storage';
import {VOICE_CATALOG} from '../voices/catalog';
import {
  DEBUG_ERRORS_STORAGE_KEY,
  installDebugErrorCapture,
  isDebugErrorRecord,
} from '../shared/debugErrors';
import type {BackgroundMessage, DebugErrorRecord} from '../shared/messages';

const MAX_DEBUG_ERRORS = 100;
let debugErrorWriteQueue: Promise<void> = Promise.resolve();

installDebugErrorCapture('background', saveDebugError);

browser.runtime.onInstalled.addListener(async () => {
  await setSettings(await getSettings());
});

browser.runtime.onMessage.addListener(async (message: unknown) => {
  if (!isBackgroundMessage(message)) {
    return {ok: false};
  }

  switch (message.type) {
    case 'get_settings':
      return getSettings();
    case 'set_settings':
      await setSettings(message.settings);
      return {ok: true};
    case 'get_voice_catalog':
      return VOICE_CATALOG;
    case 'open_panel':
      return {ok: true};
    case 'report_debug_error':
      await saveDebugError(message.error);
      return {ok: true};
    case 'get_debug_errors':
      return getDebugErrors();
    default:
      return {ok: false};
  }
});

function saveDebugError(error: DebugErrorRecord): Promise<void> {
  const write = debugErrorWriteQueue.then(() => persistDebugError(error));
  // Keep later writes running; callers still receive this write's rejection.
  debugErrorWriteQueue = write.catch(() => {});
  return write;
}

async function persistDebugError(error: DebugErrorRecord): Promise<void> {
  const stored = await browser.storage.local.get(DEBUG_ERRORS_STORAGE_KEY);
  const previous = stored[DEBUG_ERRORS_STORAGE_KEY];
  const errors = Array.isArray(previous)
    ? previous.filter(isDebugErrorRecord)
    : [];
  errors.push(error);
  await browser.storage.local.set({
    [DEBUG_ERRORS_STORAGE_KEY]: errors.slice(-MAX_DEBUG_ERRORS),
  });
}

async function getDebugErrors(): Promise<DebugErrorRecord[]> {
  const stored = await browser.storage.local.get(DEBUG_ERRORS_STORAGE_KEY);
  const errors = stored[DEBUG_ERRORS_STORAGE_KEY];
  return Array.isArray(errors) ? errors.filter(isDebugErrorRecord) : [];
}

function isBackgroundMessage(message: unknown): message is BackgroundMessage {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  const record = message as Record<string, unknown>;
  const type = record['type'];
  return (
    type === 'get_settings' ||
    type === 'set_settings' ||
    type === 'get_voice_catalog' ||
    type === 'open_panel' ||
    (type === 'report_debug_error' && isDebugErrorRecord(record['error'])) ||
    type === 'get_debug_errors'
  );
}
