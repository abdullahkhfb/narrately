import {browser} from '../shared/browser';
import {getSettings, setSettings} from '../shared/storage';
import type {InferenceDevice} from '../shared/types';
import {VOICE_CATALOG} from '../voices/catalog';
import {getRequiredElement} from './dom';

export async function initializeSettingsView(): Promise<void> {
  const voice = getRequiredElement('voice', HTMLSelectElement);
  const speed = getRequiredElement('speed', HTMLInputElement);
  const cache = getRequiredElement('cache', HTMLInputElement);
  const device = getRequiredElement('device', HTMLSelectElement);
  const speedOut = getRequiredElement('speed-out', HTMLOutputElement);
  const status = getRequiredElement('status', HTMLElement);
  const save = getRequiredElement('save', HTMLButtonElement);
  const open = getRequiredElement('open', HTMLButtonElement);

  for (const item of VOICE_CATALOG) {
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name;
    voice.appendChild(option);
  }

  save.addEventListener('click', async () => {
    try {
      await setSettings({
        voiceId: voice.value,
        speed: Number(speed.value),
        cacheEnabled: cache.checked,
        device: getInferenceDevice(device.value),
      });
      status.textContent = 'Saved locally.';
    } catch {
      status.textContent = 'Could not save settings. Try again.';
    }
  });

  open.addEventListener('click', async () => {
    try {
      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id === undefined) {
        status.textContent = 'Could not find the active tab.';
        return;
      }

      const reply: unknown = await browser.tabs.sendMessage(tab.id, {
        type: 'open_panel',
      });
      if (isOpenPanelResponse(reply) && reply.ok) {
        window.close();
      } else {
        status.textContent = 'No readable chapter text found on this page.';
      }
    } catch {
      status.textContent = 'Narrately cannot run here. Try reloading the page.';
    }
  });

  speed.addEventListener('input', () => {
    speedOut.value = `${Number(speed.value).toFixed(2)}×`;
  });

  try {
    const settings = await getSettings();
    voice.value = settings.voiceId;
    speed.value = String(settings.speed);
    cache.checked = settings.cacheEnabled;
    device.value = settings.device;
  } catch {
    status.textContent = 'Could not load settings. Default values are shown.';
  }

  speedOut.value = `${Number(speed.value).toFixed(2)}×`;
}

function getInferenceDevice(value: string): InferenceDevice {
  return value === 'webgpu' ? 'webgpu' : 'wasm';
}

function isOpenPanelResponse(value: unknown): value is {ok: boolean} {
  return (
    typeof value === 'object' &&
    value !== null &&
    'ok' in value &&
    typeof value.ok === 'boolean'
  );
}
