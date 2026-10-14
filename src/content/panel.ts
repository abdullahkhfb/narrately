/**
 * @fileoverview In-page Narrately controls, rendered inside a Shadow DOM.
 */

import {browser} from '../shared/browser';
import {
  getRequiredElement,
  parseSvg,
  populateVoiceSelect,
  syncSpeedChips,
} from '../shared/dom';
import {getSettings, setSettings} from '../shared/storage';
import {createStorageController} from '../shared/storageView';
import type {Book} from '../shared/types';
import {createHostClient, type Job, type NarrationJob} from './hostClient';
import panelCss from './panel.css?inline';
import panelHtml from './panel.html?raw';
import {detectBook} from './sites';
import bubbleIcon from '../icons/ui/bubble.svg?raw';
import closeIcon from '../icons/ui/close.svg?raw';
import downloadIcon from '../icons/ui/download.svg?raw';
import forwardIcon from '../icons/ui/forward15.svg?raw';
import logoIcon from '../icons/ui/logo.svg?raw';
import nextIcon from '../icons/ui/next.svg?raw';
import pauseIcon from '../icons/ui/pause.svg?raw';
import playIcon from '../icons/ui/play.svg?raw';
import prevIcon from '../icons/ui/prev.svg?raw';
import rewindIcon from '../icons/ui/rewind15.svg?raw';
import storageIcon from '../icons/ui/storage.svg?raw';

const SKIP_SECONDS = 15;
const PANEL_ICONS = [
  ['icon-bubble', bubbleIcon],
  ['icon-logo', logoIcon],
  ['icon-storage', storageIcon],
  ['icon-close', closeIcon],
  ['icon-prev', prevIcon],
  ['icon-next', nextIcon],
  ['icon-rewind', rewindIcon],
  ['icon-forward', forwardIcon],
  ['icon-download', downloadIcon],
  ['play', playIcon],
] as const;

let shadow: ShadowRoot | undefined;
let openHook: (() => void) | undefined;

/** Mounts the panel if the page has narratable text. Returns success. */
export function mountPanel(): boolean {
  if (shadow) {
    return true;
  }
  const book = detectBook();
  if (!book) {
    return false;
  }

  const host = document.createElement('div');
  host.id = 'narrately-root';
  shadow = host.attachShadow({mode: 'open'});
  const style = document.createElement('style');
  style.textContent = panelCss;
  const root = document.createElement('div');
  root.append(renderPanel(book));
  shadow.append(style, root);
  document.documentElement.appendChild(host);

  void wirePanel(root, book);
  return true;
}

/** Opens the panel if it is mounted. */
export function openPanel(): boolean {
  if (!openHook) {
    return false;
  }
  openHook();
  return true;
}

function renderPanel(book: Book): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = panelHtml;
  const fragment = template.content;

  const bookTitle = getRequiredElement(fragment, 'book-title', HTMLElement);
  bookTitle.textContent = book.title;
  bookTitle.title = book.title;

  const chapter = getRequiredElement(fragment, 'chapter', HTMLSelectElement);
  const options = document.createDocumentFragment();
  for (let i = 0; i < book.chapters.length; i += 1) {
    const item = book.chapters[i];
    if (!item) {
      continue;
    }
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = item.title;
    options.append(option);
  }
  chapter.append(options);

  const multi = book.chapters.length > 1;
  getRequiredElement(fragment, 'prev', HTMLButtonElement).disabled = !multi;
  getRequiredElement(fragment, 'next', HTMLButtonElement).disabled = !multi;

  populateVoiceSelect(getRequiredElement(fragment, 'voice', HTMLSelectElement));

  const versionName = browser.runtime.getManifest().version_name ?? '';
  if (versionName.includes('-')) {
    const badge = document.createElement('span');
    badge.className = 'beta';
    badge.title = versionName;
    badge.textContent = 'Beta';
    getRequiredElement(fragment, 'brand', HTMLElement).append(' ', badge);
  }

  for (const [id, icon] of PANEL_ICONS) {
    getRequiredElement(fragment, id, Element).append(parseSvg(icon));
  }
  return fragment;
}

async function wirePanel(root: ParentNode, book: Book): Promise<void> {
  const $ = <T extends HTMLElement>(id: string, type: {new (): T}): T =>
    getRequiredElement(root, id, type);

  const toggle = $('toggle', HTMLButtonElement);
  const panel = $('panel', HTMLElement);
  const close = $('close', HTMLButtonElement);
  const chapter = $('chapter', HTMLSelectElement);
  const prev = $('prev', HTMLButtonElement);
  const next = $('next', HTMLButtonElement);
  const voice = $('voice', HTMLSelectElement);
  const speed = $('speed', HTMLInputElement);
  const speedChips = $('speed-chips', HTMLElement);
  const text = $('text', HTMLTextAreaElement);
  const count = $('count', HTMLElement);
  const textToggle = $('text-toggle', HTMLButtonElement);
  const textSheet = $('text-sheet', HTMLElement);
  const textDone = $('text-done', HTMLButtonElement);
  const chapterLabel = $('chapter-label', HTMLElement);
  const openStorage = $('open-storage', HTMLButtonElement);
  const storageBack = $('storage-back', HTMLButtonElement);
  const storageStatus = $('storage-status', HTMLElement);
  const generate = $('generate', HTMLButtonElement);
  const generateLabel = $('generate-label', HTMLElement);
  const fill = $('fill', HTMLElement);
  const status = $('status', HTMLElement);
  const player = $('player', HTMLElement);
  const seek = $('seek', HTMLInputElement);
  const cur = $('cur', HTMLElement);
  const dur = $('dur', HTMLElement);
  const play = $('play', HTMLButtonElement);
  const viewListen = $('view-listen', HTMLElement);
  const viewStorage = $('view-storage', HTMLElement);
  const modelCard = $('model', HTMLElement);
  const modelButton = $('model-download', HTMLButtonElement);
  const modelLabel = $('model-label', HTMLElement);
  const modelFill = $('model-fill', HTMLElement);
  const modelStatus = $('model-status', HTMLElement);
  const modelBlurb = $('model-blurb', HTMLElement);

  const host = createHostClient();
  const audio = new Audio();
  let job: NarrationJob | undefined;
  let cancelled = false;
  let latestUrl: string | undefined;
  let generatedSpeed = 1;
  let startedAt = 0;
  let firstDoneAt = 0;
  let warmedDevice: string | undefined;

  let settings: Awaited<ReturnType<typeof getSettings>>;
  let settingsUnavailable = false;
  try {
    settings = await getSettings();
  } catch (error: unknown) {
    status.textContent = getErrorMessage(error);
    settings = {
      voiceId: 'af_heart',
      speed: 1,
      device: 'wasm',
      cacheEnabled: true,
    };
    settingsUnavailable = true;
  }

  voice.value = settings.voiceId;
  speed.value = String(settings.speed);
  if (settingsUnavailable) {
    voice.disabled = true;
    speed.disabled = true;
    for (const chip of speedChips.querySelectorAll('button')) {
      chip.disabled = true;
    }
    modelButton.disabled = true;
  }

  const applyPlaybackRate = (): void => {
    const rate = Number(speed.value) / generatedSpeed;
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    audio.preservesPitch = true;
  };

  const showSpeed = (): void => {
    syncSpeedChips(speedChips, Number(speed.value));
    applyPlaybackRate();
  };
  showSpeed();

  const storageController = createStorageController(root, {
    read: () => host.storageInfo(),
    clear: (target) => host.clearStorage(target),
    onCleared: (target) => {
      if (target !== 'chapters') {
        warmedDevice = undefined;
        void refreshModel();
      }
    },
    onReadError: (error, statusElement) => {
      statusElement.textContent = getErrorMessage(error);
    },
    onClearError: (error, statusElement) => {
      statusElement.textContent = getErrorMessage(error);
    },
  });

  const showView = (name: 'listen' | 'text' | 'storage'): void => {
    viewListen.hidden = name !== 'listen';
    textSheet.hidden = name !== 'text';
    viewStorage.hidden = name !== 'storage';
    if (name === 'storage') {
      storageStatus.textContent = '';
      void storageController.refresh();
    }
  };

  const setOpen = (open: boolean): void => {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close Narrately' : 'Open Narrately');
    if (open) {
      toggle.classList.remove('ready');
      void refreshModel();
    }
  };
  openHook = () => setOpen(true);
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  close.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (viewListen.hidden) {
        showView('listen');
      } else {
        setOpen(false);
        toggle.focus();
      }
    }
    event.stopPropagation();
  });
  panel.addEventListener('keyup', (event) => event.stopPropagation());
  panel.addEventListener('keypress', (event) => event.stopPropagation());

  const resetPlayer = (): void => {
    audio.pause();
    audio.removeAttribute('src');
    if (latestUrl) {
      URL.revokeObjectURL(latestUrl);
      latestUrl = undefined;
    }
    player.hidden = true;
  };

  const syncChapter = (): void => {
    const index = Number(chapter.value);
    text.value = book.chapters[index]?.text ?? '';
    count.textContent = describeText(text.value.length);
    chapterLabel.textContent =
      book.chapters.length > 1
        ? `Chapter ${index + 1} of ${book.chapters.length}`
        : 'Chapter';
    prev.disabled = index <= 0;
    next.disabled = index >= book.chapters.length - 1;
  };

  const selectChapter = (index: number): void => {
    chapter.value = String(index);
    resetPlayer();
    syncChapter();
    status.textContent = 'Ready.';
  };

  chapter.addEventListener('change', () => selectChapter(Number(chapter.value)));
  prev.addEventListener('click', () => selectChapter(Number(chapter.value) - 1));
  next.addEventListener('click', () => selectChapter(Number(chapter.value) + 1));
  syncChapter();

  text.addEventListener('input', () => {
    count.textContent = describeText(text.value.length);
  });
  textToggle.addEventListener('click', () => {
    showView('text');
    text.focus();
  });
  textDone.addEventListener('click', () => {
    showView('listen');
    textToggle.focus();
  });
  openStorage.addEventListener('click', () => {
    showView('storage');
    storageBack.focus();
  });
  storageBack.addEventListener('click', () => {
    showView('listen');
    openStorage.focus();
  });

  const persist = (): void => {
    void getSettings()
      .then((current) =>
        setSettings({...current, voiceId: voice.value, speed: Number(speed.value)}),
      )
      .catch((error: unknown) => {
        status.textContent = getErrorMessage(error);
      });
  };
  voice.addEventListener('change', persist);
  speedChips.addEventListener('click', (event) => {
    const chip = (event.target as Element).closest<HTMLButtonElement>('button[data-speed]');
    if (!chip) {
      return;
    }
    speed.value = chip.dataset['speed'] ?? '1';
    showSpeed();
    persist();
  });

  let download: Job<void> | undefined;
  let downloadCancelled = false;

  const setModelReady = (ready: boolean): void => {
    modelCard.hidden = ready;
    generate.disabled = !ready;
  };

  async function refreshModel(): Promise<void> {
    try {
      const {device} = await getSettings();
      modelBlurb.textContent =
        device === 'webgpu'
          ? 'WebGPU fast mode needs a one-time download of about 312 MB from Hugging Face, stored on this device.'
          : 'One-time download of about 88 MB from Hugging Face, stored on this device. Narration then works offline.';
      const installed = await host.modelInstalled(device);
      setModelReady(installed);
      if (installed && warmedDevice !== device) {
        warmedDevice = device;
        host.warmup(device);
      }
    } catch (error: unknown) {
      if (!isExtensionContextInvalidated(error)) {
        console.error('Could not check the voice model:', error);
      }
      status.textContent = getErrorMessage(error);
      setModelReady(!isExtensionContextInvalidated(error));
    }
  }

  modelButton.addEventListener('click', async () => {
    if (download) {
      downloadCancelled = true;
      download.cancel();
      return;
    }
    downloadCancelled = false;
    modelLabel.textContent = 'Cancel download';
    modelStatus.textContent = 'Starting…';
    try {
      const {device} = await getSettings();
      download = host.downloadModel(
        device,
        ({completed, total, loadedBytes, totalBytes}) => {
          const percent = (completed / Math.max(total, 1)) * 100;
          modelFill.style.width = `${percent}%`;
          modelLabel.textContent = `Downloading… ${Math.round(percent)}% (cancel)`;
          if (totalBytes) {
            modelStatus.textContent = `${formatMb(loadedBytes ?? 0)} of ${formatMb(totalBytes)}`;
          }
        },
      );
      await download.promise;
      await refreshModel();
      status.textContent = 'Voice model ready.';
    } catch (error: unknown) {
      modelStatus.textContent = downloadCancelled
        ? 'Download cancelled.'
        : `${withPeriod(getErrorMessage(error))} Check your connection and retry.`;
      modelLabel.textContent = 'Retry download';
    } finally {
      download = undefined;
      modelFill.style.width = '0%';
    }
  });

  const setGenerating = (busy: boolean): void => {
    generateLabel.textContent = busy ? 'Cancel' : 'Narrate this chapter';
    generate.classList.toggle('busy', busy);
    if (!busy) {
      fill.style.width = '0%';
    }
  };

  generate.addEventListener('click', async () => {
    if (job) {
      cancelled = true;
      job.cancel();
      status.textContent = 'Cancelling after the current part…';
      return;
    }

    cancelled = false;
    resetPlayer();
    setGenerating(true);
    status.textContent = 'Loading the voice model — the first run takes longer…';

    try {
      const current = await getSettings();
      startedAt = performance.now();
      firstDoneAt = 0;
      generatedSpeed = Number(speed.value);
      job = host.narrate(
        {
          text: text.value,
          voiceId: voice.value,
          speed: Number(speed.value),
          device: current.device,
          cacheEnabled: current.cacheEnabled,
        },
        ({completed, total}) => {
          fill.style.width = `${(completed / Math.max(total, 1)) * 100}%`;
          if (completed === 0) {
            return;
          }
          const now = performance.now();
          firstDoneAt ||= now;
          const left =
            completed > 1
              ? (((now - firstDoneAt) / (completed - 1)) * (total - completed)) / 1000
              : 0;
          status.textContent =
            completed < total
              ? `Preparing part ${completed + 1} of ${total}${left ? ` · about ${formatDuration(left)} left` : ''}`
              : 'Finishing…';
        },
      );
      const result = await job.promise;
      latestUrl = URL.createObjectURL(new Blob([result.audio], {type: 'audio/wav'}));
      audio.src = latestUrl;
      applyPlaybackRate();
      player.hidden = false;
      const seconds = (performance.now() - startedAt) / 1000;
      status.textContent = `Chapter ready (prepared in ${formatDuration(seconds)}) — nothing left your device.`;
      if (panel.hidden) {
        toggle.classList.add('ready');
      } else {
        try {
          await audio.play();
        } catch {
          // Autoplay may be blocked before user gesture.
        }
      }
    } catch (error: unknown) {
      status.textContent = cancelled ? 'Cancelled.' : getErrorMessage(error);
      if (/not found locally|Could not locate file/i.test(String(error))) {
        setModelReady(false);
      }
    } finally {
      job = undefined;
      setGenerating(false);
    }
  });

  const setIcon = (): void => {
    play.replaceChildren(parseSvg(audio.paused ? playIcon : pauseIcon));
    play.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
    toggle.classList.toggle('playing', !audio.paused);
  };
  play.addEventListener('click', () => {
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  });
  $('back', HTMLButtonElement).addEventListener('click', () => {
    audio.currentTime = Math.max(0, audio.currentTime - SKIP_SECONDS);
  });
  $('forward', HTMLButtonElement).addEventListener('click', () => {
    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + SKIP_SECONDS);
  });
  audio.addEventListener('play', setIcon);
  audio.addEventListener('pause', setIcon);
  audio.addEventListener('ended', setIcon);
  audio.addEventListener('loadedmetadata', () => {
    dur.textContent = formatTime(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    cur.textContent = formatTime(audio.currentTime);
    if (audio.duration) {
      seek.value = String((audio.currentTime / audio.duration) * 1000);
    }
  });
  seek.addEventListener('input', () => {
    if (audio.duration) {
      audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
    }
  });

  $('download', HTMLButtonElement).addEventListener('click', () => {
    if (!latestUrl) {
      return;
    }
    const link = document.createElement('a');
    link.href = latestUrl;
    link.download = `${sanitizeFilename(book.title)} - ${sanitizeFilename(
      book.chapters[Number(chapter.value)]?.title ?? 'Chapter',
    )}.wav`;
    link.click();
  });

  setIcon();
}

function describeText(length: number): string {
  return `${length.toLocaleString()} characters · about ${Math.max(1, Math.round(length / 900))} min`;
}

function withPeriod(message: string): string {
  return /[.!?]$/.test(message) ? message : `${message}.`;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function sanitizeFilename(value: string): string {
  return (
    value.replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim() ||
    'Narrately'
  );
}

function getErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Narration failed.';
  if (isExtensionContextInvalidated(error)) {
    return 'Narrately was reloaded or updated. Refresh this page to reconnect.';
  }
  if (/not found locally|Could not locate file/i.test(message)) {
    return 'The voice model is missing. Reopen the panel and use "Download model".';
  }
  return message;
}

function isExtensionContextInvalidated(error: unknown): boolean {
  return error instanceof Error && /extension context invalidated/i.test(error.message);
}

function formatDuration(seconds: number): string {
  if (seconds < 90) {
    return `${Math.max(1, Math.round(seconds))} s`;
  }
  return `${Math.round(seconds / 60)} min`;
}

function formatMb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
