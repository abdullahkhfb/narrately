/**
 * @fileoverview Adapter for Lnori (lnori.com), an officially supported site.
 */

import type {Book, Chapter} from '../../shared/types';
import {
  cleanTitle,
  mergeChapterPart,
  normalize,
  readParagraphs,
  type ChapterPartState,
} from './text';
import type {SiteAdapter} from './types';

export const lnoriAdapter: SiteAdapter = {
  id: 'lnori',
  name: 'Lnori',
  hosts: ['lnori.com'],

  detect(doc: Document): Book | null {
    const sections = doc.querySelectorAll('section.chapter');
    if (sections.length === 0) {
      return null;
    }

    const chapters: Chapter[] = [];
    let previousPart: ChapterPartState | null = null;
    let index = 0;

    for (const section of sections) {
      const currentIndex = index;
      index += 1;
      const main = section.querySelector('.main') ?? section;
      const title = normalize(
        main.querySelector('h2.chapter-title, h2')?.textContent,
      );
      const paragraphs = readParagraphs(main);
      if (paragraphs.length === 0) {
        continue;
      }

      const text = paragraphs.join('\n\n');
      const previousChapter = chapters[chapters.length - 1];
      if (!title) {
        if (previousChapter && !section.querySelector('img')) {
          previousChapter.text += `\n\n${text}`;
        }
        continue;
      }

      const {displayTitle, nextPart, merged} = mergeChapterPart(
        title,
        text,
        previousChapter,
        previousPart,
      );
      previousPart = nextPart;
      if (merged) {
        continue;
      }

      chapters.push({
        id: section.id || `chapter-${currentIndex}`,
        title: displayTitle || `Chapter ${chapters.length + 1}`,
        text,
        element: section,
      });
    }

    if (chapters.length === 0) {
      return null;
    }
    return {title: cleanTitle(doc.title), chapters, source: 'lnori'};
  },
};
