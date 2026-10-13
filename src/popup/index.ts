/**
 * @fileoverview Popup entry point.
 */

import {browser} from '../shared/browser';
import {installDebugErrorCapture} from '../shared/debugErrors';
import type {DebugErrorRecord} from '../shared/messages';
import {getRequiredElement} from './dom';
import {initializeSettingsView} from './settings-view';
import {initializeStorageView} from './storage-view';
import {parseSvg} from '../shared/svg';
import logoIcon from '../icons/ui/logo.svg?raw';

installDebugErrorCapture('popup', reportPopupError);

function reportPopupError(error: DebugErrorRecord): Promise<void> {
  return browser.runtime
    .sendMessage({type: 'report_debug_error', error})
    .then(() => undefined);
}

getRequiredElement('logo', HTMLElement).replaceChildren(parseSvg(logoIcon));

const manifest = browser.runtime.getManifest();
const version = manifest.version_name ?? manifest.version;
getRequiredElement('version', HTMLElement).textContent = `Local novel narrator · v${version}`;
getRequiredElement('beta', HTMLElement).hidden = !version.includes('-');

getRequiredElement('debug-open', HTMLButtonElement).addEventListener('click', async () => {
  try {
    await browser.windows.create({
      url: browser.runtime.getURL('src/popup/debug.html'),
      type: 'popup',
      width: 560,
      height: 480,
    });
  } catch {
    getRequiredElement('status', HTMLElement).textContent =
      'Could not open the debug window. Try again.';
  }
});

const settingsView = getRequiredElement('settings-view', HTMLElement);
const storageView = getRequiredElement('storage-view', HTMLElement);
const showStorage = (open: boolean): void => {
  settingsView.hidden = open;
  storageView.hidden = !open;
  getRequiredElement(open ? 'storage-back' : 'storage-open', HTMLButtonElement).focus();
};
getRequiredElement('storage-open', HTMLButtonElement).addEventListener('click', () => showStorage(true));
getRequiredElement('storage-back', HTMLButtonElement).addEventListener('click', () => showStorage(false));

await initializeSettingsView();
await initializeStorageView();
