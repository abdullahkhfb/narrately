/**
 * @fileoverview Adapter for Lnori (lnori.com), the officially supported site.
 */

import type {Book, Chapter} from '../../shared/types';
import type {SiteAdapter} from './types';
import {cleanTitle, normalize, readParagraphs} from './text';

const CHAPTER_PREFIX = /^chapter\s+\d+\s*:\s*/i;
const PART_SUFFIX = /\s*\(part\s+(one|two|three|four|five|six|seven|eight|nine|ten)\)$/i;

const PART_NUMBER: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

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
    let previousPart: {title: string; number: number} | null = null;
    for (const [index, section] of sections.entries()) {
      const main = section.querySelector('.main') ?? section;
      const title = normalize(main.querySelector('h2.chapter-title, h2')?.textContent);
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

      const partMatch = title.match(PART_SUFFIX);
      const chapterName = title.replace(CHAPTER_PREFIX, '').replace(PART_SUFFIX, '').trim();
      const displayTitle = partMatch ? title.replace(PART_SUFFIX, '').trim() : title;
      const partLabel = partMatch?.[1]?.toLowerCase();
      const partNumber = partLabel ? PART_NUMBER[partLabel] : undefined;
      if (
        previousChapter &&
        partNumber !== undefined &&
        previousPart?.title === chapterName.toLowerCase() &&
        previousPart.number + 1 === partNumber
      ) {
        previousChapter.text += `\n\n${text}`;
        previousPart = {title: chapterName.toLowerCase(), number: partNumber};
        continue;
      }

      chapters.push({
        id: section.id || `chapter-${index}`,
        title: displayTitle || `Chapter ${chapters.length + 1}`,
        text,
        element: section,
      });
      previousPart =
        partNumber === 1 ? {title: chapterName.toLowerCase(), number: partNumber} : null;
    }

    if (chapters.length === 0) {
      return null;
    }
    return {title: cleanTitle(doc.title), chapters, source: 'lnori'};
  },
};
