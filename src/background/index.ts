/**
 * @fileoverview Background entry point for settings, downloads, and
 * catalog requests.
 */

import {browser} from '../shared/browser';
import {getSettings, setSettings} from '../shared/storage';
import {VOICE_CATALOG} from '../voices/catalog';
import type {BackgroundMessage} from '../shared/messages';

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
    default:
      return {ok: false};
  }
});

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
    type === 'open_panel'
  );
}
