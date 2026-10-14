/**
 * @fileoverview Popup storage view controller.
 */

import {getRequiredElement} from '../shared/dom';
import {clearStorage, getStorageInfo} from '../shared/storageManager';
import {createStorageController} from '../shared/storageView';

export async function initializeStorageView(): Promise<void> {
  const $ = <T extends Element>(id: string, type: {new (): T}): T =>
    getRequiredElement(document, id, type);

  const summaryTotal = $('summary-total', HTMLElement);
  const summaryMeter = $('summary-meter', HTMLElement);
  const summaryChapters = $('summary-meter-chapters', HTMLElement);
  const summaryModel = $('summary-meter-model', HTMLElement);
  const chaptersMeta = $('chapters-meta', HTMLElement);
  const modelMeta = $('model-meta', HTMLElement);

  const controller = createStorageController(document, {
    read: getStorageInfo,
    clear: clearStorage,
    onRender: (info, totalText) => {
      const sum = info.chapterBytes + info.modelBytes;
      summaryTotal.textContent = totalText;
      summaryChapters.style.flexGrow = String(info.chapterBytes);
      summaryModel.style.flexGrow = String(info.modelBytes);
      summaryMeter.classList.toggle('empty', sum === 0);
    },
    onReadError: () => {
      summaryTotal.textContent = '—';
      chaptersMeta.textContent = 'Could not read storage.';
      modelMeta.textContent = 'Could not read storage.';
    },
  });

  await controller.refresh();
}
