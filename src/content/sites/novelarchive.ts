/**
 * @fileoverview Adapter for Novel Archive (novelarchive.cc), an officially supported site.
 */

import type {Book, Chapter} from '../../shared/types';
import {hostMatches, normalize} from './text';
import type {SiteAdapter} from './types';

const HOST = 'novelarchive.cc';
const CHAPTER_HEADING = /^chapter\b/i;
const CREDIT_LABEL = /^(translator|editor):$/i;

function chapterText(article: HTMLElement): string {
  const rawLines = article.innerText.split(/\r?\n/);
  const textLines: string[] = [];
  let skipCredit = false;
  let seenFirstLine = false;

  for (const rawLine of rawLines) {
    const line = normalize(rawLine);
    if (!line) {
      continue;
    }
    if (!seenFirstLine) {
      seenFirstLine = true;
      if (CHAPTER_HEADING.test(line)) {
        continue;
      }
    }
    if (CREDIT_LABEL.test(line)) {
      skipCredit = true;
      continue;
    }
    if (skipCredit) {
      skipCredit = false;
      continue;
    }
    textLines.push(line);
  }

  return textLines.join('\n\n');
}

export const novelArchiveAdapter: SiteAdapter = {
  id: 'novelarchive',
  name: 'Novel Archive',
  hosts: [HOST],

  detect(doc: Document): Book | null {
    if (!hostMatches(doc.location?.hostname ?? '', HOST)) {
      return null;
    }

    const article = doc.querySelector<HTMLElement>('#reader-article');
    const chapterTitle = normalize(
      doc.querySelector('#reader-chapter-title')?.textContent,
    );
    const bookTitle = normalize(
      doc.querySelector('#reader-novel-title')?.textContent,
    );
    if (!article || !chapterTitle || !bookTitle) {
      return null;
    }

    const text = chapterText(article);
    if (!text) {
      return null;
    }

    const chapterId = new URLSearchParams(doc.location?.search ?? '').get(
      'chapter',
    );
    const chapter: Chapter = {
      id: chapterId || 'current',
      title: chapterTitle,
      text,
      element: article,
    };
    return {title: bookTitle, chapters: [chapter], source: 'novelarchive'};
  },
};
