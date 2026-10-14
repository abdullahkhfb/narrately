/**
 * @fileoverview Popup entry point.
 */

import logoIcon from '../icons/ui/logo.svg?raw';
import {browser} from '../shared/browser';
import {installDebugErrorCapture} from '../shared/debugErrors';
import {getRequiredElement, parseSvg} from '../shared/dom';
import type {DebugErrorRecord} from '../shared/messages';
import {initializeSettingsView} from './settings-view';
import {initializeStorageView} from './storage-view';

installDebugErrorCapture('popup', reportPopupError);

function reportPopupError(error: DebugErrorRecord): Promise<void> {
  return browser.runtime
    .sendMessage({type: 'report_debug_error', error})
    .then(() => undefined);
}

const $ = <T extends Element>(id: string, type: {new (): T}): T =>
  getRequiredElement(document, id, type);

$('logo', HTMLElement).replaceChildren(parseSvg(logoIcon));

const manifest = browser.runtime.getManifest();
const version = manifest.version_name ?? manifest.version;
$('version', HTMLElement).textContent = `Local novel narrator · v${version}`;
$('beta', HTMLElement).hidden = !version.includes('-');

$('debug-open', HTMLButtonElement).addEventListener('click', async () => {
  try {
    await browser.windows.create({
      url: browser.runtime.getURL('src/popup/debug.html'),
      type: 'popup',
      width: 560,
      height: 480,
    });
  } catch {
    $('status', HTMLElement).textContent =
      'Could not open the debug window. Try again.';
  }
});

const settingsView = $('settings-view', HTMLElement);
const storageView = $('storage-view', HTMLElement);
const storageOpen = $('storage-open', HTMLButtonElement);
const storageBack = $('storage-back', HTMLButtonElement);

const showStorage = (open: boolean): void => {
  settingsView.hidden = open;
  storageView.hidden = !open;
  (open ? storageBack : storageOpen).focus();
};

storageOpen.addEventListener('click', () => showStorage(true));
storageBack.addEventListener('click', () => showStorage(false));

await Promise.all([initializeSettingsView(), initializeStorageView()]);
