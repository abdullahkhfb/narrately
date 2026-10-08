/**
 * @fileoverview Extension URL helper for the host page and the inference
 * worker. Both run on the extension origin but have no `chrome.runtime`
 * guarantee, so this avoids webextension-polyfill (which throws there).
 */

/** Absolute URL for an extension-local file, from an extension-origin context. */
export function extensionUrl(path: string): string {
  return new URL(path, `${self.location.origin}/`).href;
}
