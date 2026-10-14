/**
 * @fileoverview Shared storage meter and clear-action controller for popup and panel UIs.
 */

import {getRequiredElement} from './dom';
import {
  formatBytes,
  type ClearTarget,
  type StorageInfo,
} from './storageManager';

export interface StorageViewHooks {
  read(): Promise<StorageInfo>;
  clear(target: ClearTarget): Promise<StorageInfo>;
  onRender?: (info: StorageInfo, totalText: string) => void;
  onCleared?: (target: ClearTarget, info: StorageInfo) => void;
  onReadError?: (error: unknown, statusElement: HTMLElement) => void;
  onClearError?: (error: unknown, statusElement: HTMLElement) => void;
}

export interface StorageController {
  refresh(): Promise<void>;
}

const CLEAR_TARGETS: readonly ClearTarget[] = ['chapters', 'model', 'all'];

/** Wires the storage usage meter and clear buttons within `root`. */
export function createStorageController(
  root: ParentNode,
  hooks: StorageViewHooks,
): StorageController {
  const total = getRequiredElement(root, 'storage-total', HTMLElement);
  const meter = getRequiredElement(root, 'meter', HTMLElement);
  const meterChapters = getRequiredElement(root, 'meter-chapters', HTMLElement);
  const meterModel = getRequiredElement(root, 'meter-model', HTMLElement);
  const chaptersMeta = getRequiredElement(root, 'chapters-meta', HTMLElement);
  const modelMeta = getRequiredElement(root, 'model-meta', HTMLElement);
  const status = getRequiredElement(root, 'storage-status', HTMLElement);
  const buttons: Record<ClearTarget, HTMLButtonElement> = {
    chapters: getRequiredElement(root, 'clear-chapters', HTMLButtonElement),
    model: getRequiredElement(root, 'clear-model', HTMLButtonElement),
    all: getRequiredElement(root, 'clear-all', HTMLButtonElement),
  };

  let busy = false;
  let latest: StorageInfo | undefined;

  const render = (info: StorageInfo): void => {
    const sum = info.chapterBytes + info.modelBytes;
    const totalText = sum > 0 ? formatBytes(sum) : 'Empty';
    total.textContent = totalText;
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

    buttons.chapters.disabled = busy || info.chapterEntries === 0;
    buttons.model.disabled = busy || info.modelBytes === 0;
    buttons.all.disabled = busy || sum === 0;
    hooks.onRender?.(info, totalText);
  };

  const refresh = async (): Promise<void> => {
    try {
      latest = await hooks.read();
      render(latest);
    } catch (error: unknown) {
      total.textContent = '—';
      if (hooks.onReadError) {
        hooks.onReadError(error, status);
      } else {
        chaptersMeta.textContent = 'Could not read storage.';
        modelMeta.textContent = 'Could not read storage.';
      }
    }
  };

  const clear = async (target: ClearTarget): Promise<void> => {
    if (busy || !latest) {
      return;
    }
    const before = latest;
    busy = true;
    render(before);
    status.textContent = 'Clearing…';
    try {
      latest = await hooks.clear(target);
      const freed =
        (target !== 'model' ? before.chapterBytes - latest.chapterBytes : 0) +
        (target !== 'chapters' ? before.modelBytes - latest.modelBytes : 0);
      status.textContent = `Cleared. Freed ${formatBytes(Math.max(freed, 0))}.`;
      hooks.onCleared?.(target, latest);
    } catch (error: unknown) {
      if (hooks.onClearError) {
        hooks.onClearError(error, status);
      } else {
        status.textContent =
          'Could not clear storage. Close other Narrately tabs and try again.';
      }
    } finally {
      busy = false;
      if (latest) {
        render(latest);
      }
    }
  };

  for (const target of CLEAR_TARGETS) {
    buttons[target].addEventListener('click', () => void clear(target));
  }

  return {refresh};
}
