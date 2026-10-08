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
import panelCss from './panel.css?inline';
import bubbleIcon from '../icons/ui/bubble.svg?raw';
import closeIcon from '../icons/ui/close.svg?raw';
import downloadIcon from '../icons/ui/download.svg?raw';
import eyeIcon from '../icons/ui/eye.svg?raw';
import forwardIcon from '../icons/ui/forward15.svg?raw';
import logoIcon from '../icons/ui/logo.svg?raw';
import pauseIcon from '../icons/ui/pause.svg?raw';
import playIcon from '../icons/ui/play.svg?raw';
import restartIcon from '../icons/ui/restart.svg?raw';
import rewindIcon from '../icons/ui/rewind15.svg?raw';

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
        <button class="icon" id="close" aria-label="Close">${closeIcon}</button>
      </header>
      <div class="body">
        <div class="field">
          <span class="label">Chapter</span>
          <div class="chapter-row">
            <button class="icon" id="prev" aria-label="Previous chapter" ${multi ? '' : 'disabled'}>‹</button>
            <select id="chapter" aria-label="Chapter">${chapters}</select>
            <button class="icon" id="next" aria-label="Next chapter" ${multi ? '' : 'disabled'}>›</button>
          </div>
        </div>
        <div class="grid">
          <label class="field"><span class="label">Voice</span><select id="voice">${voices}</select></label>
          <label class="field"><span class="label">Speed <output id="speed-out">1.00×</output></span>
            <input id="speed" type="range" min="0.6" max="1.6" step="0.05" value="1"></label>
        </div>
        <div class="field">
          <div class="text-head">
            <span class="label">Text <output id="count"></output></span>
            <button class="link" id="text-toggle" aria-expanded="false">${eyeIcon}<span>Preview</span></button>
          </div>
          <textarea id="text" spellcheck="false" aria-label="Chapter text" hidden></textarea>
        </div>
        <div class="model" id="model" hidden>
          <strong>Voice model needed</strong>
          <span id="model-blurb"></span>
          <button class="primary" id="model-download"><span class="fill" id="model-fill"></span><span class="label-text" id="model-label">Download model</span></button>
          <p class="status" id="model-status" role="status" aria-live="polite"></p>
        </div>
        <button class="primary" id="generate" disabled><span class="fill" id="fill"></span><span class="label-text" id="generate-label">Generate narration</span></button>
        <p class="status" id="status" role="status" aria-live="polite">Runs entirely on your device.</p>
        <div class="player" id="player" hidden>
          <input id="seek" type="range" min="0" max="1000" value="0" aria-label="Seek">
          <div class="times"><span id="cur">0:00</span><span id="dur">0:00</span></div>
          <div class="controls">
            <button class="icon" id="restart" aria-label="Restart">${restartIcon}</button>
            <button class="icon" id="back" aria-label="Back ${SKIP_SECONDS} seconds">${rewindIcon}</button>
            <button class="icon round" id="play" aria-label="Play">${playIcon}</button>
            <button class="icon" id="forward" aria-label="Forward ${SKIP_SECONDS} seconds">${forwardIcon}</button>
            <button class="icon" id="download" aria-label="Download WAV">${downloadIcon}</button>
          </div>
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
  const speedOut = $('speed-out', HTMLElement);
  const text = $('text', HTMLTextAreaElement);
  const count = $('count', HTMLElement);
  const textToggle = $('text-toggle', HTMLButtonElement);
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
  let startedAt = 0;
  let firstDoneAt = 0;

  const settings = await getSettings();
  voice.value = settings.voiceId;
  speed.value = String(settings.speed);
  const showSpeed = (): void => {
    speedOut.textContent = `${Number(speed.value).toFixed(2)}×`;
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
      setOpen(false);
      toggle.focus();
    }
    // Keep page shortcuts (e.g. reader hotkeys) from firing while typing.
    event.stopPropagation();
  });

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
    count.textContent = `${text.value.length.toLocaleString()} characters`;
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
    count.textContent = `${text.value.length.toLocaleString()} characters`;
  });
  textToggle.addEventListener('click', () => {
    text.hidden = !text.hidden;
    textToggle.setAttribute('aria-expanded', String(!text.hidden));
    textToggle.querySelector('span')!.textContent = text.hidden ? 'Preview' : 'Hide';
  });

  const persist = (): void => {
    void getSettings().then((current) =>
      setSettings({...current, voiceId: voice.value, speed: Number(speed.value)}),
    );
  };
  voice.addEventListener('change', persist);
  speed.addEventListener('input', showSpeed);
  speed.addEventListener('change', persist);

  // Voice model: gate Generate until the files are on this device.
  let download: Job<void> | undefined;
  let downloadCancelled = false;

  const setModelReady = (ready: boolean): void => {
    modelCard.hidden = ready;
    generate.disabled = !ready;
  };

  let warmedDevice: string | undefined;
  /** Re-checks the model for the current device (the popup may have changed
   * it) and pre-loads it so the first narration starts sooner. */
  async function refreshModel(): Promise<void> {
    const {device} = await getSettings();
    modelBlurb.textContent =
      device === 'webgpu'
        ? 'WebGPU fast mode needs a one-time download of about 312 MB from Hugging Face. It is stored on this device.'
        : 'One-time download of about 88 MB from Hugging Face. It is stored on this device, and narration then works offline.';
    try {
      const installed = await host.modelInstalled(device);
      setModelReady(installed);
      if (installed && warmedDevice !== device) {
        warmedDevice = device;
        host.warmup(device);
      }
    } catch {
      setModelReady(true);
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
        : `${getErrorMessage(error)} Check your connection and retry.`;
      modelLabel.textContent = 'Retry download';
    } finally {
      download = undefined;
      modelFill.style.width = '0%';
    }
  });

  const setGenerating = (busy: boolean): void => {
    generateLabel.textContent = busy ? 'Cancel' : 'Generate narration';
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
  $('restart', HTMLButtonElement).addEventListener('click', () => {
    audio.currentTime = 0;
    void audio.play();
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
  if (/not found locally|Could not locate file/i.test(message)) {
    return 'The voice model is missing. Reopen the panel and use "Download model".';
  }
  return message;
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

