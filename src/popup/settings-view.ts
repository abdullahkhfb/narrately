/**
 * @fileoverview Popup settings view controller.
 */

import {browser} from '../shared/browser';
import {
  getRequiredElement,
  populateVoiceSelect,
  syncSpeedChips,
} from '../shared/dom';
import {getSettings, setSettings} from '../shared/storage';
import type {InferenceDevice} from '../shared/types';

const DEVICE_HINTS: Readonly<Record<InferenceDevice, string>> = {
  wasm: 'Works on every computer. Downloads an 88 MB voice model once.',
  webgpu: 'Faster on computers with a modern graphics card. Downloads a 312 MB voice model once.',
};

export async function initializeSettingsView(): Promise<void> {
  const $ = <T extends Element>(id: string, type: {new (): T}): T =>
    getRequiredElement(document, id, type);

  const voice = $('voice', HTMLSelectElement);
  const speed = $('speed', HTMLInputElement);
  const cache = $('cache', HTMLInputElement);
  const chips = $('speed-chips', HTMLElement);
  const deviceHint = $('device-hint', HTMLElement);
  const status = $('status', HTMLElement);
  const saved = $('saved', HTMLElement);
  const open = $('open', HTMLButtonElement);
  const deviceRadios = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[name="device"]'),
  );

  populateVoiceSelect(voice);

  const selectedDevice = (): InferenceDevice =>
    getInferenceDevice(deviceRadios.find((radio) => radio.checked)?.value ?? 'wasm');

  const showSpeed = (): void => {
    syncSpeedChips(chips, Number(speed.value));
  };
  const showDevice = (): void => {
    deviceHint.textContent = DEVICE_HINTS[selectedDevice()];
  };

  let savedTimer: number | undefined;
  const save = async (): Promise<void> => {
    try {
      await setSettings({
        voiceId: voice.value,
        speed: Number(speed.value),
        cacheEnabled: cache.checked,
        device: selectedDevice(),
      });
      saved.textContent = 'Saved';
      saved.classList.add('show');
      window.clearTimeout(savedTimer);
      savedTimer = window.setTimeout(() => saved.classList.remove('show'), 1400);
    } catch {
      status.textContent = 'Could not save settings. Try again.';
    }
  };

  open.addEventListener('click', async () => {
    status.textContent = '';
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
        status.textContent =
          'No chapter text found here. Open a chapter page and try again.';
      }
    } catch {
      status.textContent = 'Narrately cannot run on this page. Reload it and try again.';
    }
  });

  chips.addEventListener('click', (event) => {
    const chip = (event.target as Element).closest<HTMLButtonElement>('button[data-speed]');
    if (!chip) {
      return;
    }
    speed.value = chip.dataset['speed'] ?? '1';
    showSpeed();
    void save();
  });
  voice.addEventListener('change', () => void save());
  cache.addEventListener('change', () => void save());
  for (const radio of deviceRadios) {
    radio.addEventListener('change', () => {
      showDevice();
      void save();
    });
  }

  try {
    const settings = await getSettings();
    voice.value = settings.voiceId;
    speed.value = String(settings.speed);
    cache.checked = settings.cacheEnabled;
    for (const radio of deviceRadios) {
      radio.checked = radio.value === settings.device;
    }
  } catch {
    status.textContent = 'Could not load settings. Default values are shown.';
  }

  showSpeed();
  showDevice();
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
