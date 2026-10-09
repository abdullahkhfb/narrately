import {browser} from '../shared/browser';
import {
  DEBUG_ERRORS_STORAGE_KEY,
  installDebugErrorCapture,
  isDebugErrorRecord,
} from '../shared/debugErrors';
import type {DebugErrorRecord, GetDebugErrorsMessage} from '../shared/messages';
import {getRequiredElement} from './dom';

installDebugErrorCapture('debug', reportDebugError);

function reportDebugError(error: DebugErrorRecord): Promise<void> {
  return browser.runtime
    .sendMessage({type: 'report_debug_error', error})
    .then(() => undefined);
}

const copyButton = getRequiredElement('copy-errors', HTMLButtonElement);
const debugErrors = getRequiredElement('debug-errors', HTMLTextAreaElement);
const debugStatus = getRequiredElement('debug-status', HTMLElement);
const defaultButtonText = copyButton.textContent ?? 'Copy captured logs';

let feedbackTimer: number | undefined;
let fitTimer: number | undefined;

copyButton.addEventListener('click', async () => {
  const errors = debugErrors.value.trim();
  resetCopyFeedback();

  if (!errors) {
    debugStatus.textContent = 'No Narrately logs have been captured yet.';
    return;
  }

  try {
    await copyToClipboard(errors);
    copyButton.textContent = 'Copied!';
    copyButton.classList.add('copy-confirmation');
    debugStatus.textContent = 'Errors copied. Paste them into your bug report.';
    feedbackTimer = window.setTimeout(resetCopyFeedback, 2500);
  } catch {
    debugStatus.textContent = 'Could not copy errors. Check clipboard access and try again.';
  }
});

void loadCapturedErrors();
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && DEBUG_ERRORS_STORAGE_KEY in changes) {
    void loadCapturedErrors();
  }
});

async function loadCapturedErrors(): Promise<void> {
  const request: GetDebugErrorsMessage = {type: 'get_debug_errors'};
  try {
    const records = await browser.runtime.sendMessage(request);
    if (!Array.isArray(records)) {
      throw new Error('The background returned an invalid debug report.');
    }
    const capturedErrors = records.filter(isDebugErrorRecord);
    debugErrors.value = formatDebugErrors(capturedErrors);
    debugStatus.textContent = capturedErrors.length
      ? `${capturedErrors.length} Narrately log${capturedErrors.length === 1 ? '' : 's'} captured.`
      : 'No Narrately logs have been captured yet.';
    debugErrors.rows = Math.min(24, Math.max(9, debugErrors.value.split('\n').length));
    scheduleWindowFit();
  } catch {
    debugStatus.textContent = 'Could not load captured errors. Reload the extension and try again.';
  }
}

function formatDebugErrors(records: DebugErrorRecord[]): string {
  return records
    .map((record) => {
      const details = [
        `[${record.timestamp}] ${(record.level ?? 'error').toUpperCase()} ${record.source}: ${record.message}`,
        record.location,
        record.stack,
      ].filter((value): value is string => Boolean(value));
      return details.join('\n');
    })
    .join('\n\n');
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    if (copyWithDocumentCommand(text)) {
      return;
    }
    throw new Error('Clipboard write failed.');
  }
}

function copyWithDocumentCommand(text: string): boolean {
  const temporaryInput = document.createElement('textarea');
  temporaryInput.value = text;
  temporaryInput.setAttribute('readonly', '');
  temporaryInput.style.position = 'fixed';
  temporaryInput.style.left = '-9999px';
  document.body.appendChild(temporaryInput);
  temporaryInput.select();

  try {
    return document.execCommand('copy');
  } finally {
    temporaryInput.remove();
  }
}

window.addEventListener('resize', scheduleWindowFit);
window.addEventListener('load', scheduleWindowFit);
scheduleWindowFit();

function scheduleWindowFit(): void {
  if (fitTimer !== undefined) {
    window.clearTimeout(fitTimer);
  }
  fitTimer = window.setTimeout(() => {
    fitTimer = undefined;
    void fitWindowToContent();
  }, 100);
}

async function fitWindowToContent(): Promise<void> {
  try {
    const currentWindow = await browser.windows.getCurrent();
    if (currentWindow.id === undefined) {
      return;
    }

    const horizontalChrome = window.outerWidth - window.innerWidth;
    const verticalChrome = window.outerHeight - window.innerHeight;
    const maxWidth = Math.max(320, window.screen.availWidth - 32);
    const maxHeight = Math.max(280, window.screen.availHeight - 48);
    const maxContentWidth = Math.max(320, Math.min(680, maxWidth - horizontalChrome));
    document.body.style.minWidth = `${Math.min(380, maxContentWidth)}px`;
    document.body.style.maxWidth = `${maxContentWidth}px`;
    const content = document.body.getBoundingClientRect();
    const width = Math.min(maxWidth, Math.ceil(content.width + horizontalChrome));
    const height = Math.min(maxHeight, Math.ceil(content.height + verticalChrome));

    if (
      currentWindow.width !== undefined &&
      currentWindow.height !== undefined &&
      Math.abs(currentWindow.width - width) < 4 &&
      Math.abs(currentWindow.height - height) < 4
    ) {
      return;
    }

    await browser.windows.update(currentWindow.id, {width, height});
  } catch {
    debugStatus.textContent = 'Could not resize the debug window automatically.';
  }
}

function resetCopyFeedback(): void {
  if (feedbackTimer !== undefined) {
    window.clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
  }
  copyButton.textContent = defaultButtonText;
  copyButton.classList.remove('copy-confirmation');
}
