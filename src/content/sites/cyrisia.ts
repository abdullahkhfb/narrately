/**
 * @fileoverview Adapter for Cyrisia (cyrisia.com), an officially supported site.
 */

import type {Book, Chapter} from '../../shared/types';
import {
  cleanTitle,
  hostMatches,
  mergeChapterPart,
  normalize,
  readParagraphs,
  type ChapterPartState,
} from './text';
import type {SiteAdapter} from './types';

const HOST = 'cyrisia.com';
const MIN_SECTION_CHARS = 200;

const INLINE_SELECTORS = [
  'main.ch-page',
  '#ch-text',
  '#reader',
  '#viewer',
  '#epub-viewer',
  '[class*="epub" i]',
  '[class*="reader" i]',
  'main',
  'article',
];

const HEADING_SELECTOR = 'h1, h2, h3, h4, [class*="title" i]';

function frameDocument(frame: HTMLIFrameElement): Document | null {
  try {
    return frame.contentDocument;
  } catch {
    return null;
  }
}

function toChapter(
  root: Element,
  element: Element,
  fallbackTitle: string,
  id: string,
): Chapter | null {
  const paragraphs = readParagraphs(root);
  const text = paragraphs.join('\n\n');
  if (text.length < MIN_SECTION_CHARS) {
    return null;
  }
  const title = normalize(root.querySelector(HEADING_SELECTOR)?.textContent);
  return {
    id,
    title: title && title.length <= 120 ? title : fallbackTitle,
    text,
    element,
  };
}

function chaptersFromFrames(doc: Document): Chapter[] {
  const chapters: Chapter[] = [];
  const frames = doc.querySelectorAll('iframe');
  let index = 0;
  for (const frame of frames) {
    const currentIndex = index;
    index += 1;
    const inner = frameDocument(frame);
    if (!inner?.body) {
      continue;
    }
    const chapter = toChapter(
      inner.body,
      frame,
      `Chapter ${chapters.length + 1}`,
      frame.id || `section-${currentIndex}`,
    );
    if (chapter) {
      chapters.push(chapter);
    }
  }

  const grouped: Chapter[] = [];
  let previousPart: ChapterPartState | null = null;
  for (const chapter of chapters) {
    const {displayTitle, nextPart, merged} = mergeChapterPart(
      chapter.title,
      chapter.text,
      grouped[grouped.length - 1],
      previousPart,
    );
    previousPart = nextPart;
    if (merged) {
      continue;
    }

    grouped.push({
      ...chapter,
      title: displayTitle,
    });
  }

  return grouped;
}

function chaptersFromInline(doc: Document): Chapter[] {
  for (const selector of INLINE_SELECTORS) {
    const roots = doc.querySelectorAll(selector);
    for (const root of roots) {
      const chapter = toChapter(
        root,
        root,
        'Current chapter',
        root.id || 'current',
      );
      if (chapter) {
        return [chapter];
      }
    }
  }
  return [];
}

export const cyrisiaAdapter: SiteAdapter = {
  id: 'cyrisia',
  name: 'Cyrisia',
  hosts: [HOST],

  detect(doc: Document): Book | null {
    if (!hostMatches(doc.location?.hostname ?? '', HOST)) {
      return null;
    }

    const fromFrames = chaptersFromFrames(doc);
    const chapters =
      fromFrames.length > 0 ? fromFrames : chaptersFromInline(doc);
    if (chapters.length === 0) {
      return null;
    }
    return {title: cleanTitle(doc.title), chapters, source: 'cyrisia'};
  },
};
