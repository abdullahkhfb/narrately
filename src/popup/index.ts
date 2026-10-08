/**
 * @fileoverview Popup settings UI.
 */

import {browser} from '../shared/browser';
import {getSettings, setSettings} from '../shared/storage';
import {VOICE_CATALOG} from '../voices/catalog';
import logoIcon from '../icons/ui/logo.svg?raw';
import type {InferenceDevice} from '../shared/types';

getRequiredElement('logo', HTMLElement).innerHTML = logoIcon;
const manifest = browser.runtime.getManifest();
getRequiredElement('version', HTMLElement).textContent = `Local novel narrator · v${manifest.version_name ?? manifest.version}`;
getRequiredElement('beta', HTMLElement).hidden = !(manifest.version_name ?? '').includes('-');
const voice = getRequiredElement('voice', HTMLSelectElement);
const speed = getRequiredElement('speed', HTMLInputElement);
const cache = getRequiredElement('cache', HTMLInputElement);
const device = getRequiredElement('device', HTMLSelectElement);
const speedOut = getRequiredElement('speed-out', HTMLElement);
const status = getRequiredElement('status', HTMLElement);
const save = getRequiredElement('save', HTMLButtonElement);
const open = getRequiredElement('open', HTMLButtonElement);

for (const item of VOICE_CATALOG) {
  const option = document.createElement('option');
  option.value = item.id;
  option.textContent = item.name;
  voice.appendChild(option);
}

const settings = await getSettings();
voice.value = settings.voiceId;
speed.value = String(settings.speed);
cache.checked = settings.cacheEnabled;
device.value = settings.device;

const showSpeed = (): void => {
  speedOut.textContent = `${Number(speed.value).toFixed(2)}×`;
};
speed.addEventListener('input', showSpeed);
showSpeed();

save.addEventListener('click', async () => {
  const nextDevice = getInferenceDevice(device.value);
  await setSettings({
    voiceId: voice.value,
    speed: Number(speed.value),
    cacheEnabled: cache.checked,
    device: nextDevice,
  });
  status.textContent = 'Saved locally.';
});

open.addEventListener('click', async () => {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id === undefined) {
    return;
  }

  try {
    const reply: unknown = await browser.tabs.sendMessage(tab.id, {
      type: 'open_panel',
    });
    if ((reply as {ok?: boolean} | undefined)?.ok) {
      window.close();
    } else {
      status.textContent = 'No readable chapter text found on this page.';
    }
  } catch {
    // Browser-internal pages and unreloaded tabs have no content script.
    status.textContent = 'Narrately cannot run here. Try reloading the page.';
  }
});

function getRequiredElement<T extends Element>(
  id: string,
  elementType: {new (): T},
): T {
  const element = document.getElementById(id);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing popup element: #${id}`);
  }
  return element;
}

function getInferenceDevice(value: string): InferenceDevice {
  if (value === 'webgpu') {
    return 'webgpu';
  }
  return 'wasm';
}
