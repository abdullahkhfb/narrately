/**
 * @fileoverview In-page Narrately controls, rendered inside a Shadow DOM so
 * the host page's styles cannot leak in and ours cannot leak out.
 */

import {browser} from '../shared/browser';
import {getSettings, setSettings} from '../shared/storage';
import {VOICE_CATALOG} from '../voices/catalog';
import type {Book} from '../shared/types';
import {detectBook} from './sites';
import {createHostClient, type Job, type NarrationJob} from './hostClient';
import {formatBytes, type ClearTarget, type StorageInfo} from '../shared/storageManager';
import panelCss from './panel.css?inline';
import bubbleIcon from '../icons/ui/bubble.svg?raw';
import closeIcon from '../icons/ui/close.svg?raw';
import downloadIcon from '../icons/ui/download.svg?raw';
import forwardIcon from '../icons/ui/forward15.svg?raw';
import logoIcon from '../icons/ui/logo.svg?raw';
import pauseIcon from '../icons/ui/pause.svg?raw';
import playIcon from '../icons/ui/play.svg?raw';
import rewindIcon from '../icons/ui/rewind15.svg?raw';
import storageIcon from '../icons/ui/storage.svg?raw';

const SKIP_SECONDS = 15;
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
  shadow.append(style);
  const root = document.createElement('div');
  root.innerHTML = renderPanel(book);
  shadow.append(root);
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

function renderPanel(book: Book): string {
  const chapters = book.chapters
    .map((c, i) => `<option value="${i}">${escapeHtml(c.title)}</option>`)
    .join('');
  const voices = VOICE_CATALOG.map(
    (v) =>
      `<option value="${v.id}" title="${escapeHtml(v.description)}">${escapeHtml(v.name)} · ${escapeHtml(v.language)}</option>`,
  ).join('');
  const multi = book.chapters.length > 1;

  return `
    <button class="bubble" id="toggle" aria-label="Open Narrately" aria-expanded="false">${bubbleIcon}</button>
    <section class="panel" id="panel" role="dialog" aria-label="Narrately narrator" hidden>
      <header class="head">
        <span class="logo">${logoIcon}</span>
        <div class="titles">
          <strong>Narrately${betaBadge()}</strong>
          <span class="book" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</span>
        </div>
        <button class="icon" id="open-storage" aria-label="Storage on this device" title="Storage">${storageIcon}</button>
        <button class="icon" id="close" aria-label="Close">${closeIcon}</button>
      </header>
      <div class="views">
        <div class="body" id="view-listen">
          <div class="field">
            <span class="label" id="chapter-label">Chapter</span>
            <div class="chapter-row">
              <button class="icon" id="prev" aria-label="Previous chapter" ${multi ? '' : 'disabled'}>‹</button>
              <select id="chapter" aria-label="Chapter">${chapters}</select>
              <button class="icon" id="next" aria-label="Next chapter" ${multi ? '' : 'disabled'}>›</button>
            </div>
          </div>
          <div class="row">
            <label class="field grow"><span class="label">Voice</span><select id="voice">${voices}</select></label>
            <div class="field">
              <span class="label">Speed</span>
              <input id="speed" type="hidden" value="1">
              <div class="chips" id="speed-chips" role="group" aria-label="Speed">
                <button type="button" data-speed="1" aria-pressed="false">1×</button>
                <button type="button" data-speed="1.25" aria-pressed="false">1.25×</button>
                <button type="button" data-speed="1.5" aria-pressed="false">1.5×</button>
              </div>
            </div>
          </div>
          <div class="text-row">
            <span id="count"></span>
            <button class="link" id="text-toggle" type="button">Preview text</button>
          </div>
          <div class="model" id="model" hidden>
            <strong>Download the voice first</strong>
            <span id="model-blurb"></span>
            <button class="primary" id="model-download"><span class="fill" id="model-fill"></span><span class="label-text" id="model-label">Download model</span></button>
            <p class="status" id="model-status" role="status" aria-live="polite"></p>
          </div>
          <div class="player" id="player" hidden>
            <input id="seek" type="range" min="0" max="1000" value="0" aria-label="Seek">
            <div class="times"><span id="cur">0:00</span><span id="dur">0:00</span></div>
            <div class="controls">
              <button class="icon" id="back" aria-label="Back ${SKIP_SECONDS} seconds">${rewindIcon}</button>
              <button class="icon round" id="play" aria-label="Play">${playIcon}</button>
              <button class="icon" id="forward" aria-label="Forward ${SKIP_SECONDS} seconds">${forwardIcon}</button>
              <button class="icon" id="download" aria-label="Download WAV">${downloadIcon}</button>
            </div>
          </div>
          <div class="spacer"></div>
          <button class="primary" id="generate" disabled><span class="fill" id="fill"></span><span class="label-text" id="generate-label">Narrate this chapter</span></button>
          <p class="status" id="status" role="status" aria-live="polite">Runs entirely on your device.</p>
        </div>
        <div class="body" id="text-sheet" hidden>
          <div class="sheet-head">
            <strong>Chapter text</strong>
            <button class="link" id="text-done" type="button">Done</button>
          </div>
          <textarea id="text" spellcheck="false" aria-label="Chapter text"></textarea>
          <p class="status">Edit the text to change what is read aloud.</p>
        </div>
        <div class="body" id="view-storage" hidden>
          <div class="sheet-head"><strong>Stored on this device</strong></div>
          <div class="storage-card">
            <div class="storage-head"><span>Total</span><strong id="storage-total">…</strong></div>
            <div class="meter" id="meter" role="img" aria-label="Storage in use">
              <span id="meter-chapters" class="seg kind-chapters"></span>
              <span id="meter-model" class="seg kind-model"></span>
            </div>
            <ul class="storage-rows">
              <li>
                <span class="dot kind-chapters" aria-hidden="true"></span>
                <div class="row-text"><b>Narrated chapters</b><small id="chapters-meta">Checking…</small></div>
                <button class="clear" id="clear-chapters" disabled>Clear</button>
              </li>
              <li>
                <span class="dot kind-model" aria-hidden="true"></span>
                <div class="row-text"><b>Voice model</b><small id="model-meta">Checking…</small></div>
                <button class="clear" id="clear-model" disabled>Delete</button>
              </li>
            </ul>
          </div>
          <button class="clear clear-all" id="clear-all" disabled>Clear everything</button>
          <p class="status ok" id="storage-status" role="status" aria-live="polite"></p>
          <div class="spacer"></div>
          <button class="primary quiet" id="storage-back" type="button">Back to narration</button>
        </div>
      </div>
    </section>
  `;
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
  const generate = $('generate', HTMLButtonElement);
  const generateLabel = $('generate-label', HTMLElement);
  const fill = $('fill', HTMLElement);
  const status = $('status', HTMLElement);
  const player = $('player', HTMLElement);
  const seek = $('seek', HTMLInputElement);
  const cur = $('cur', HTMLElement);
  const dur = $('dur', HTMLElement);
  const play = $('play', HTMLButtonElement);
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
  let latest: ArrayBuffer | undefined;
  let latestUrl: string | undefined;
  let generatedSpeed = 1;
  let startedAt = 0;
  let firstDoneAt = 0;

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
  /** Playback ratio between the chosen speed and the speed the audio was made at. */
  const applyPlaybackRate = (): void => {
    const rate = Number(speed.value) / generatedSpeed;
    // Both properties: assigning `src` resets `playbackRate` to the default.
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    audio.preservesPitch = true;
  };
  const showSpeed = (): void => {
    const value = Number(speed.value);
    for (const chip of speedChips.querySelectorAll<HTMLButtonElement>('button')) {
      chip.setAttribute('aria-pressed', String(Math.abs(Number(chip.dataset['speed']) - value) < 0.001));
    }
    applyPlaybackRate();
  };
  showSpeed();

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
    // Keep page shortcuts (e.g. reader hotkeys) from firing while typing.
    event.stopPropagation();
  });
  // Readers often page on keyup/keypress too, so the arrow keys that move a
  // slider must not turn the page behind it.
  panel.addEventListener('keyup', (event) => event.stopPropagation());
  panel.addEventListener('keypress', (event) => event.stopPropagation());

  const resetPlayer = (): void => {
    audio.pause();
    audio.removeAttribute('src');
    if (latestUrl) {
      URL.revokeObjectURL(latestUrl);
    }
    latest = undefined;
    latestUrl = undefined;
    player.hidden = true;
  };

  const syncChapter = (): void => {
    const index = Number(chapter.value);
    text.value = book.chapters[index]?.text ?? '';
    count.textContent = describeText(text.value.length);
    chapterLabel.textContent =
      book.chapters.length > 1 ? `Chapter ${index + 1} of ${book.chapters.length}` : 'Chapter';
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

  let warmedDevice: string | undefined;

  // Views: Listen, text editor, Storage (all share the same fixed space).
  const viewListen = $('view-listen', HTMLElement);
  const viewStorage = $('view-storage', HTMLElement);
  const storageTotal = $('storage-total', HTMLElement);
  const meter = $('meter', HTMLElement);
  const meterChapters = $('meter-chapters', HTMLElement);
  const meterModel = $('meter-model', HTMLElement);
  const chaptersMeta = $('chapters-meta', HTMLElement);
  const modelMeta = $('model-meta', HTMLElement);
  const storageStatus = $('storage-status', HTMLElement);
  const clearButtons: Record<ClearTarget, HTMLButtonElement> = {
    chapters: $('clear-chapters', HTMLButtonElement),
    model: $('clear-model', HTMLButtonElement),
    all: $('clear-all', HTMLButtonElement),
  };
  let storageBusy = false;
  let storageLatest: StorageInfo | undefined;

  const renderStorage = (info: StorageInfo): void => {
    const sum = info.chapterBytes + info.modelBytes;
    storageTotal.textContent = sum > 0 ? formatBytes(sum) : 'Empty';
    meterChapters.style.flexGrow = String(info.chapterBytes);
    meterModel.style.flexGrow = String(info.modelBytes);
    meter.classList.toggle('empty', sum === 0);
    meter.setAttribute(
      'aria-label',
      `Chapters ${formatBytes(info.chapterBytes)}, voice model ${formatBytes(info.modelBytes)}`,
    );
    chaptersMeta.textContent =
      info.chapterEntries > 0
        ? `${formatBytes(info.chapterBytes)} · replays instantly`
        : 'Nothing saved yet';
    modelMeta.textContent =
      info.modelBytes > 0
        ? `${formatBytes(info.modelBytes)} · needed to narrate`
        : 'Not downloaded';
    clearButtons.chapters.disabled = storageBusy || info.chapterEntries === 0;
    clearButtons.model.disabled = storageBusy || info.modelBytes === 0;
    clearButtons.all.disabled = storageBusy || sum === 0;
  };

  const refreshStorage = async (): Promise<void> => {
    try {
      storageLatest = await host.storageInfo();
      renderStorage(storageLatest);
    } catch (error: unknown) {
      storageTotal.textContent = '—';
      storageStatus.textContent = getErrorMessage(error);
    }
  };

  const showView = (name: 'listen' | 'text' | 'storage'): void => {
    viewListen.hidden = name !== 'listen';
    textSheet.hidden = name !== 'text';
    viewStorage.hidden = name !== 'storage';
    if (name === 'storage') {
      storageStatus.textContent = '';
      void refreshStorage();
    }
  };
  openStorage.addEventListener('click', () => {
    showView('storage');
    storageBack.focus();
  });
  storageBack.addEventListener('click', () => {
    showView('listen');
    openStorage.focus();
  });

  const clearStored = async (target: ClearTarget): Promise<void> => {
    if (storageBusy || !storageLatest) {
      return;
    }
    const before = storageLatest;
    storageBusy = true;
    renderStorage(before);
    storageStatus.textContent = 'Clearing…';
    try {
      storageLatest = await host.clearStorage(target);
      const freed =
        (target !== 'model' ? before.chapterBytes - storageLatest.chapterBytes : 0) +
        (target !== 'chapters' ? before.modelBytes - storageLatest.modelBytes : 0);
      storageStatus.textContent = `Cleared. Freed ${formatBytes(Math.max(freed, 0))}.`;
      if (target !== 'chapters') {
        warmedDevice = undefined;
        void refreshModel();
      }
    } catch (error: unknown) {
      storageStatus.textContent = getErrorMessage(error);
    } finally {
      storageBusy = false;
      if (storageLatest) {
        renderStorage(storageLatest);
      }
    }
  };
  for (const [target, button] of Object.entries(clearButtons) as [ClearTarget, HTMLButtonElement][]) {
    button.addEventListener('click', () => void clearStored(target));
  }

  // Voice model: gate Generate until the files are on this device.
  let download: Job<void> | undefined;
  let downloadCancelled = false;

  const setModelReady = (ready: boolean): void => {
    modelCard.hidden = ready;
    generate.disabled = !ready;
  };

  /** Re-checks the model for the current device (the popup may have changed
   * it) and pre-loads it so the first narration starts sooner. */
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
      download = host.downloadModel(device, ({completed, total, loadedBytes, totalBytes}) => {
        const percent = (completed / Math.max(total, 1)) * 100;
        modelFill.style.width = `${percent}%`;
        modelLabel.textContent = `Downloading… ${Math.round(percent)}% (cancel)`;
        if (totalBytes) {
          modelStatus.textContent = `${formatMb(loadedBytes ?? 0)} of ${formatMb(totalBytes)}`;
        }
      });
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
          // Estimate from the pace after the first part, which also absorbs
          // the one-time model load.
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
      latest = result.audio;
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
          // Autoplay can be blocked until the user interacts with the page.
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

  // Player controls.
  const setIcon = (): void => {
    play.innerHTML = audio.paused ? playIcon : pauseIcon;
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
    if (!latestUrl || !latest) {
      return;
    }
    // A plain anchor works in content scripts; no downloads permission or
    // background round-trip (which would also mangle the ArrayBuffer).
    const link = document.createElement('a');
    link.href = latestUrl;
    link.download = `${sanitizeFilename(book.title)} - ${sanitizeFilename(
      book.chapters[Number(chapter.value)]?.title ?? 'Chapter',
    )}.wav`;
    link.click();
  });

  setIcon();
}

/** Looks up an element by id and verifies its type. */
function getRequiredElement<T extends Element>(
  parent: ParentNode,
  id: string,
  elementType: {new (): T},
): T {
  const element = parent.querySelector(`#${id}`);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing panel element: #${id}`);
  }
  return element;
}

/** "5,420 characters · about 6 min" (narration runs near 900 characters a minute). */
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

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (c) => entities[c] ?? c);
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

/** A "Beta" pill when the installed build is a pre-release. */
function betaBadge(): string {
  const name = browser.runtime.getManifest().version_name ?? '';
  return name.includes('-')
    ? ` <span class="beta" title="${escapeHtml(name)}">Beta</span>`
    : '';
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
