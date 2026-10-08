/**
 * @fileoverview Adapter for Lnori (lnori.com), the officially supported site.
 */

import type {Book, Chapter} from '../../shared/types';
import type {SiteAdapter} from './types';
import {cleanTitle, normalize, readParagraphs} from './text';

/** One `section.chapter` per chapter, with the text under `.main`. */
export const lnoriAdapter: SiteAdapter = {
  id: 'lnori',
  name: 'Lnori',
  hosts: ['lnori.com'],

  detect(doc: Document): Book | null {
    const sections = Array.from(doc.querySelectorAll('section.chapter'));
    if (sections.length === 0) {
      return null;
    }

    const chapters: Chapter[] = [];
    for (const [index, section] of sections.entries()) {
      const main = section.querySelector('.main') ?? section;
      const title =
        normalize(main.querySelector('h2.chapter-title, h2')?.textContent) ||
        `Chapter ${index + 1}`;
      const paragraphs = readParagraphs(main);
      if (paragraphs.length === 0) {
        continue;
      }
      chapters.push({
        id: section.id || `chapter-${index}`,
        title,
        text: paragraphs.join('\n\n'),
        element: section,
      });
    }

    if (chapters.length === 0) {
      return null;
    }
    return {title: cleanTitle(doc.title), chapters, source: 'lnori'};
  },
};
