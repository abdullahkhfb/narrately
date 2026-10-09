/**
 * @fileoverview Content-script entry point for the Narrately panel.
 */

import {browser} from '../shared/browser';
import {installDebugErrorCapture} from '../shared/debugErrors';
import type {DebugErrorRecord} from '../shared/messages';
import {mountPanel, openPanel} from './panel';

const GIVE_UP_AFTER_MS = 60_000;

installDebugErrorCapture('content', reportContentError);

function reportContentError(error: DebugErrorRecord): Promise<void> {
  return browser.runtime
    .sendMessage({type: 'report_debug_error', error})
    .then(() => undefined);
}

function start(): void {
  if (mountPanel()) {
    return;
  }
  // Reader sites often render chapters after load, so keep watching briefly.
  let timer: number | undefined;
  const retry = (): void => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (mountPanel()) {
        stop();
      }
    }, 800);
  };
  // Frame content (EPUB readers) is invisible to the observer, but the frame's
  // load event does not bubble, so listen for it in the capture phase.
  const onLoad = (event: Event): void => {
    if (event.target instanceof HTMLIFrameElement) {
      retry();
    }
  };
  const observer = new MutationObserver(retry);
  const stop = (): void => {
    window.clearTimeout(timer);
    observer.disconnect();
    document.removeEventListener('load', onLoad, true);
  };
  observer.observe(document.body, {childList: true, subtree: true});
  document.addEventListener('load', onLoad, true);
  window.setTimeout(stop, GIVE_UP_AFTER_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, {once: true});
} else {
  start();
}

browser.runtime.onMessage.addListener((message: unknown) => {
  if (!isOpenPanelMessage(message)) {
    return undefined;
  }
  // mountPanel is a no-op when already mounted; try it once more in case
  // the page finished rendering since the last attempt.
  const ok = mountPanel() && openPanel();
  return Promise.resolve({ok});
});

function isOpenPanelMessage(message: unknown): boolean {
  if (typeof message !== 'object' || message === null) {
    return false;
  }
  return (message as Record<string, unknown>)['type'] === 'open_panel';
}
