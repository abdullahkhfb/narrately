/**
 * @fileoverview Debug window controller for inspecting and copying captured logs.
 */

import logoIcon from '../icons/ui/logo.svg?raw';
import {browser} from '../shared/browser';
import {
  DEBUG_ERRORS_STORAGE_KEY,
  installDebugErrorCapture,
  isDebugErrorRecord,
} from '../shared/debugErrors';
import {getRequiredElement, parseSvg} from '../shared/dom';
import type {DebugErrorRecord, GetDebugErrorsMessage} from '../shared/messages';

installDebugErrorCapture('debug', reportDebugError);

function reportDebugError(error: DebugErrorRecord): Promise<void> {
  return browser.runtime
    .sendMessage({type: 'report_debug_error', error})
    .then(() => undefined);
}

const $ = <T extends Element>(id: string, type: {new (): T}): T =>
  getRequiredElement(document, id, type);

$('logo', HTMLElement).replaceChildren(parseSvg(logoIcon));

const copyButton = $('copy-errors', HTMLButtonElement);
const clearButton = $('clear-errors', HTMLButtonElement);
const debugLog = $('debug-log', HTMLElement);
const debugCount = $('debug-count', HTMLElement);
const debugStatus = $('debug-status', HTMLElement);
const defaultButtonText = copyButton.textContent ?? 'Copy logs';

let feedbackTimer: number | undefined;
let capturedRecords: readonly DebugErrorRecord[] = [];

copyButton.addEventListener('click', async () => {
  resetCopyFeedback();

  if (capturedRecords.length === 0) {
    debugStatus.textContent = 'No Narrately logs have been captured yet.';
    return;
  }

  try {
    await copyToClipboard(formatDebugErrors(capturedRecords));
    copyButton.textContent = 'Copied!';
    copyButton.classList.add('copy-confirmation');
    debugStatus.textContent = 'Errors copied. Paste them into your bug report.';
    feedbackTimer = window.setTimeout(resetCopyFeedback, 2500);
  } catch {
    debugStatus.textContent =
      'Could not copy errors. Check clipboard access and try again.';
  }
});

clearButton.addEventListener('click', async () => {
  resetCopyFeedback();
  try {
    await browser.runtime.sendMessage({type: 'clear_debug_errors'});
    await loadCapturedErrors();
    debugStatus.textContent = 'Logs cleared.';
  } catch {
    debugStatus.textContent =
      'Could not clear logs. Reload the extension and try again.';
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
    const records: unknown = await browser.runtime.sendMessage(request);
    if (!Array.isArray(records)) {
      throw new Error('The background returned an invalid debug report.');
    }
    capturedRecords = records.filter(isDebugErrorRecord);
    renderLog(capturedRecords);
    const total = capturedRecords.length;
    debugCount.textContent = `${total} log${total === 1 ? '' : 's'}`;
    debugStatus.textContent = total
      ? `${total} Narrately log${total === 1 ? '' : 's'} captured.`
      : 'No Narrately logs have been captured yet.';
  } catch {
    debugStatus.textContent =
      'Could not load captured errors. Reload the extension and try again.';
  }
}

function renderLog(records: readonly DebugErrorRecord[]): void {
  if (records.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent =
      'Nothing captured yet. Narrately saves its own warnings and errors here. It cannot see other extensions or page logs.';
    debugLog.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
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
    const time = Number.isNaN(when.getTime())
      ? record.timestamp
      : when.toLocaleTimeString();
    meta.textContent = `${time} · ${record.source} · ${level}`;
    const message = document.createElement('div');
    message.className = 'msg';
    message.textContent = record.message;
    body.append(meta, message);
    const more = [record.location, record.stack].filter(
      (value): value is string => Boolean(value),
    );
    if (more.length > 0) {
      const extra = document.createElement('div');
      extra.className = 'more';
      extra.textContent = more.join('\n');
      body.append(extra);
    }
    entry.append(dot, body);
    fragment.append(entry);
  }
  debugLog.replaceChildren(fragment);
}

function formatDebugErrors(records: readonly DebugErrorRecord[]): string {
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
