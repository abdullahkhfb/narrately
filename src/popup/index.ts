/**
 * @fileoverview Popup entry point.
 */

import {browser} from '../shared/browser';
import {installDebugErrorCapture} from '../shared/debugErrors';
import type {DebugErrorRecord} from '../shared/messages';
import {getRequiredElement} from './dom';
import {initializeSettingsView} from './settings-view';
import logoIcon from '../icons/ui/logo.svg?raw';

installDebugErrorCapture('popup', reportPopupError);

function reportPopupError(error: DebugErrorRecord): Promise<void> {
  return browser.runtime
    .sendMessage({type: 'report_debug_error', error})
    .then(() => undefined);
}

getRequiredElement('logo', HTMLElement).innerHTML = logoIcon;

const manifest = browser.runtime.getManifest();
const version = manifest.version_name ?? manifest.version;
getRequiredElement('version', HTMLElement).textContent = `Local novel narrator · v${version}`;
getRequiredElement('beta', HTMLElement).hidden = !version.includes('-');

getRequiredElement('debug-open', HTMLButtonElement).addEventListener('click', async () => {
  try {
    await browser.windows.create({
      url: browser.runtime.getURL('src/popup/debug.html'),
      type: 'popup',
      width: 640,
      height: 640,
    });
  } catch {
    getRequiredElement('status', HTMLElement).textContent =
      'Could not open the debug window. Try again.';
  }
});

await initializeSettingsView();
