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
const clearButton = getRequiredElement('clear-errors', HTMLButtonElement);
const debugLog = getRequiredElement('debug-log', HTMLElement);
const debugCount = getRequiredElement('debug-count', HTMLElement);
const debugStatus = getRequiredElement('debug-status', HTMLElement);
const defaultButtonText = copyButton.textContent ?? 'Copy logs';

let feedbackTimer: number | undefined;
/** Plain-text copy of what is shown, used by the Copy button. */
let logText = '';

copyButton.addEventListener('click', async () => {
  const errors = logText.trim();
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

clearButton.addEventListener('click', async () => {
  resetCopyFeedback();
  try {
    await browser.runtime.sendMessage({type: 'clear_debug_errors'});
    await loadCapturedErrors();
    debugStatus.textContent = 'Logs cleared.';
  } catch {
    debugStatus.textContent = 'Could not clear logs. Reload the extension and try again.';
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
    logText = formatDebugErrors(capturedErrors);
    renderLog(capturedErrors);
    debugCount.textContent = `${capturedErrors.length} log${capturedErrors.length === 1 ? '' : 's'}`;
    debugStatus.textContent = capturedErrors.length
      ? `${capturedErrors.length} Narrately log${capturedErrors.length === 1 ? '' : 's'} captured.`
      : 'No Narrately logs have been captured yet.';
  } catch {
    debugStatus.textContent = 'Could not load captured errors. Reload the extension and try again.';
  }
}

function renderLog(records: DebugErrorRecord[]): void {
  debugLog.replaceChildren();
  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent =
      'Nothing captured yet. Narrately saves its own warnings and errors here. It cannot see other extensions or page logs.';
    debugLog.append(empty);
    return;
  }
  for (const record of records) {
    const level = record.level ?? 'error';
    const entry = document.createElement('div');
    entry.className = `entry ${level}`;
    const dot = document.createElement('i');
    dot.className = 'lvl';
    const body = document.createElement('div');
    const meta = document.createElement('span');
    meta.className = 'meta';
    const when = new Date(record.timestamp);
    const time = Number.isNaN(when.getTime()) ? record.timestamp : when.toLocaleTimeString();
    meta.textContent = `${time} · ${record.source} · ${level}`;
    const message = document.createElement('div');
    message.className = 'msg';
    message.textContent = record.message;
    body.append(meta, message);
    const more = [record.location, record.stack].filter((value): value is string => Boolean(value));
    if (more.length) {
      const extra = document.createElement('div');
      extra.className = 'more';
      extra.textContent = more.join('\n');
      body.append(extra);
    }
    entry.append(dot, body);
    debugLog.append(entry);
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

function resetCopyFeedback(): void {
  if (feedbackTimer !== undefined) {
    window.clearTimeout(feedbackTimer);
    feedbackTimer = undefined;
  }
  copyButton.textContent = defaultButtonText;
  copyButton.classList.remove('copy-confirmation');
}
