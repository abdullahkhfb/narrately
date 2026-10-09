import type {Book, Chapter} from '../../shared/types';
import type {SiteAdapter} from './types';
import {cleanTitle, hostMatches, normalize, readParagraphs} from './text';

const HOST = 'cyrisia.com';
const MIN_SECTION_CHARS = 200;
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
    // Cross-origin frame documents are inaccessible.
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
  for (const [index, frame] of Array.from(doc.querySelectorAll('iframe')).entries()) {
    const inner = frameDocument(frame);
    if (!inner?.body) {
      continue;
    }
    const chapter = toChapter(
      inner.body,
      frame,
      `Chapter ${chapters.length + 1}`,
      frame.id || `section-${index}`,
    );
    if (chapter) {
      chapters.push(chapter);
    }
  }

  const grouped: Chapter[] = [];
  let previousPart: {title: string; number: number} | null = null;
  for (const chapter of chapters) {
    const partMatch = chapter.title.match(PART_SUFFIX);
    const chapterName = chapter.title
      .replace(CHAPTER_PREFIX, '')
      .replace(PART_SUFFIX, '')
      .trim();
    const partLabel = partMatch?.[1]?.toLowerCase();
    const partNumber = partLabel ? PART_NUMBER[partLabel] : undefined;
    const previousChapter = grouped[grouped.length - 1];

    if (
      previousChapter &&
      partNumber !== undefined &&
      previousPart?.title === chapterName.toLowerCase() &&
      previousPart.number + 1 === partNumber
    ) {
      previousChapter.text += `\n\n${chapter.text}`;
      previousPart = {title: chapterName.toLowerCase(), number: partNumber};
      continue;
    }

    grouped.push({
      ...chapter,
      title: partMatch ? chapter.title.replace(PART_SUFFIX, '').trim() : chapter.title,
    });
    previousPart =
      partNumber === 1 ? {title: chapterName.toLowerCase(), number: partNumber} : null;
  }

  return grouped;
}

function chaptersFromInline(doc: Document): Chapter[] {
  for (const selector of INLINE_SELECTORS) {
    for (const root of Array.from(doc.querySelectorAll(selector))) {
      const chapter = toChapter(root, root, 'Current chapter', root.id || 'current');
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
    const chapters = fromFrames.length > 0 ? fromFrames : chaptersFromInline(doc);
    if (chapters.length === 0) {
      return null;
    }
    return {title: cleanTitle(doc.title), chapters, source: 'cyrisia'};
  },
};
