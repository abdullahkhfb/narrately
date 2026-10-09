import type {Book, Chapter} from '../../shared/types';
import type {SiteAdapter} from './types';
import {hostMatches, normalize} from './text';

const HOST = 'novelarchive.cc';

function chapterText(article: HTMLElement): string {
  const lines = article.innerText
    .split(/\r?\n/)
    .map(normalize)
    .filter(Boolean);
  const textLines: string[] = [];
  let skipCredit = false;

  for (const [index, line] of lines.entries()) {
    if (index === 0 && /^chapter\b/i.test(line)) {
      continue;
    }
    if (/^(translator|editor):$/i.test(line)) {
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
    const bookTitle = normalize(doc.querySelector('#reader-novel-title')?.textContent);
    if (!article || !chapterTitle || !bookTitle) {
      return null;
    }

    const text = chapterText(article);
    if (!text) {
      return null;
    }

    const chapterId = new URLSearchParams(doc.location?.search ?? '').get('chapter');
    const chapter: Chapter = {
      id: chapterId || 'current',
      title: chapterTitle,
      text,
      element: article,
    };
    return {title: bookTitle, chapters: [chapter], source: 'novelarchive'};
  },
};
