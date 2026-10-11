/**
 * @fileoverview Popup storage card: shows what Narrately keeps on this
 * device and deletes it with a single click.
 */

import {
  clearStorage,
  formatBytes,
  getStorageInfo,
  type ClearTarget,
  type StorageInfo,
} from '../shared/storageManager';
import {getRequiredElement} from './dom';

export async function initializeStorageView(): Promise<void> {
  const total = getRequiredElement('storage-total', HTMLElement);
  const meter = getRequiredElement('meter', HTMLElement);
  const meterChapters = getRequiredElement('meter-chapters', HTMLElement);
  const meterModel = getRequiredElement('meter-model', HTMLElement);
  const chaptersMeta = getRequiredElement('chapters-meta', HTMLElement);
  const modelMeta = getRequiredElement('model-meta', HTMLElement);
  const summaryTotal = getRequiredElement('summary-total', HTMLElement);
  const summaryMeter = getRequiredElement('summary-meter', HTMLElement);
  const summaryChapters = getRequiredElement('summary-meter-chapters', HTMLElement);
  const summaryModel = getRequiredElement('summary-meter-model', HTMLElement);
  const status = getRequiredElement('storage-status', HTMLElement);
  const buttons: Record<ClearTarget, HTMLButtonElement> = {
    chapters: getRequiredElement('clear-chapters', HTMLButtonElement),
    model: getRequiredElement('clear-model', HTMLButtonElement),
    all: getRequiredElement('clear-all', HTMLButtonElement),
  };

  let busy = false;

  const render = (info: StorageInfo): void => {
    const sum = info.chapterBytes + info.modelBytes;
    total.textContent = sum > 0 ? formatBytes(sum) : 'Empty';
    meterChapters.style.flexGrow = String(info.chapterBytes);
    meterModel.style.flexGrow = String(info.modelBytes);
    meter.classList.toggle('empty', sum === 0);
    summaryTotal.textContent = total.textContent;
    summaryChapters.style.flexGrow = String(info.chapterBytes);
    summaryModel.style.flexGrow = String(info.modelBytes);
    summaryMeter.classList.toggle('empty', sum === 0);
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
  };

  let latest: StorageInfo | undefined;
  const refresh = async (): Promise<void> => {
    try {
      latest = await getStorageInfo();
      render(latest);
    } catch {
      total.textContent = summaryTotal.textContent = '—';
      chaptersMeta.textContent = modelMeta.textContent = 'Could not read storage.';
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
      latest = await clearStorage(target);
      const freed =
        (target !== 'model' ? before.chapterBytes - latest.chapterBytes : 0) +
        (target !== 'chapters' ? before.modelBytes - latest.modelBytes : 0);
      status.textContent = `Cleared. Freed ${formatBytes(Math.max(freed, 0))}.`;
    } catch {
      status.textContent = 'Could not clear storage. Close other Narrately tabs and try again.';
    } finally {
      busy = false;
      if (latest) {
        render(latest);
      }
    }
  };

  for (const [target, button] of Object.entries(buttons) as [ClearTarget, HTMLButtonElement][]) {
    button.addEventListener('click', () => void clear(target));
  }

  await refresh();
}
