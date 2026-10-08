/**
 * @fileoverview Site adapter registry and book detection.
 *
 * To support a new site, add an adapter file in this folder and list it in
 * `SITE_ADAPTERS`. See docs/adding-a-site.md.
 */

import type {Book} from '../../shared/types';
import {genericAdapter} from './generic';
import {lnoriAdapter} from './lnori';
import type {SiteAdapter} from './types';

export type {SiteAdapter} from './types';

/** Officially supported sites. Order only matters between host-less ties. */
export const SITE_ADAPTERS: readonly SiteAdapter[] = [lnoriAdapter];

/** True when `hostname` is `host` or one of its subdomains. */
export function hostMatches(hostname: string, host: string): boolean {
  const name = hostname.toLowerCase();
  return name === host || name.endsWith(`.${host}`);
}

/**
 * Detects the best available book on the page.
 *
 * Adapters built for the current host run first, then the remaining adapters
 * (they match on page markup, so a mirror or a local test page still works),
 * and finally the generic fallback.
 */
export function detectBook(
  doc: Document = document,
  hostname: string = location.hostname,
): Book | null {
  const forThisHost = SITE_ADAPTERS.filter((adapter) =>
    adapter.hosts.some((host) => hostMatches(hostname, host)),
  );
  const others = SITE_ADAPTERS.filter((adapter) => !forThisHost.includes(adapter));

  for (const adapter of [...forThisHost, ...others]) {
    const book = adapter.detect(doc);
    if (book) {
      return book;
    }
  }
  return genericAdapter.detect(doc);
}
