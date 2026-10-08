/**
 * @fileoverview Content-script entry point for the Narrately panel.
 */

import {browser} from '../shared/browser';
import {mountPanel, openPanel} from './panel';

const GIVE_UP_AFTER_MS = 60_000;

function start(): void {
  if (mountPanel()) {
    return;
  }
  // Reader sites often render chapters after load, so keep watching briefly.
  let timer: number | undefined;
  const observer = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (mountPanel()) {
        observer.disconnect();
      }
    }, 800);
  });
  observer.observe(document.body, {childList: true, subtree: true});
  window.setTimeout(() => observer.disconnect(), GIVE_UP_AFTER_MS);
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
