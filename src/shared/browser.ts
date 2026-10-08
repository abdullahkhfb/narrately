/**
 * @fileoverview Browser API adapter shared across extension contexts.
 */

import browser from 'webextension-polyfill';

export {browser};

/** Returns an absolute URL for an extension-local resource. */
export function extensionUrl(path: string): string {
  return browser.runtime.getURL(path);
}
