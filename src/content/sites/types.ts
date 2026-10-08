/**
 * @fileoverview Contract implemented by every site adapter.
 */

import type {Book, SiteId} from '../../shared/types';

/** Knows how to find a book and its chapters on one website. */
export interface SiteAdapter {
  /** Stable identifier; becomes `Book.source`. Also the logo file name. */
  readonly id: SiteId;
  /** Human-readable site name. */
  readonly name: string;
  /**
   * Hostnames this adapter is built for. A host also matches its subdomains,
   * so `example.com` covers `www.example.com`. Adapters whose host matches the
   * current page are tried first.
   */
  readonly hosts: readonly string[];
  /**
   * Returns the book on the page, or null when this adapter does not
   * recognize it. Must be a pure read of `doc`: no mutation, no network.
   * Be strict, so the adapter never claims a page that is not its own.
   */
  detect(doc: Document): Book | null;
}
