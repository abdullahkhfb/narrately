/**
 * @fileoverview Site adapter registry and book detection.
 */

import type {Book} from '../../shared/types';
import {cyrisiaAdapter} from './cyrisia';
import {genericAdapter} from './generic';
import {lnoriAdapter} from './lnori';
import {novelArchiveAdapter} from './novelarchive';
import {hostMatches} from './text';
import type {SiteAdapter} from './types';

export type {SiteAdapter} from './types';

/** Officially supported sites. */
export const SITE_ADAPTERS: readonly SiteAdapter[] = [
  lnoriAdapter,
  cyrisiaAdapter,
  novelArchiveAdapter,
];

function matchesHost(adapter: SiteAdapter, hostname: string): boolean {
  for (const host of adapter.hosts) {
    if (hostMatches(hostname, host)) {
      return true;
    }
  }
  return false;
}

/** Detects the best available book on the page, trying host-matched adapters first. */
export function detectBook(
  doc: Document = document,
  hostname: string = location.hostname,
): Book | null {
  for (const adapter of SITE_ADAPTERS) {
    if (matchesHost(adapter, hostname)) {
      const book = adapter.detect(doc);
      if (book) {
        return book;
      }
    }
  }

  for (const adapter of SITE_ADAPTERS) {
    if (!matchesHost(adapter, hostname)) {
      const book = adapter.detect(doc);
      if (book) {
        return book;
      }
    }
  }

  return genericAdapter.detect(doc);
}
