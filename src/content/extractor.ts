/**
 * @fileoverview Extracts book and chapter text from supported pages.
 */

import type {Book, Chapter} from '../shared/types';

const JUNK_PATTERN =
  /^(share|comments?|login|sign ?in|register|previous|next|back|home|table of contents|copyright|©|advertisement|subscribe|follow us|all rights reserved)\b/i;

/** Detects the best available book representation on the page. */
export function detectBook(): Book | null {
  return detectLnori() ?? detectGeneric();
}

function detectLnori(): Book | null {
  const sections = Array.from(document.querySelectorAll('section.chapter'));
  if (sections.length === 0) {
    return null;
  }

  const chapters: Chapter[] = [];
  for (const [index, section] of sections.entries()) {
    const main = section.querySelector('.main') ?? section;
    const title =
      normalize(main.querySelector('h2.chapter-title, h2')?.textContent) ||
      `Chapter ${index + 1}`;
    const paragraphs = Array.from(main.querySelectorAll('p, blockquote, pre'))
      .map((node) => normalize(node.textContent))
      .filter((text) => text.length > 0 && !JUNK_PATTERN.test(text));
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
  return {
    title: cleanTitle(document.title),
    chapters,
    source: 'lnori',
  };
}

function detectGeneric(): Book | null {
  const candidates = Array.from(
    document.querySelectorAll(
      'article, main, [role="main"], [class*="content" i], [class*="story" i]',
    ),
  );
  candidates.push(document.body);

  let best: Element | null = null;
  let score = 0;

  for (const candidate of candidates) {
    if (!candidate.querySelector('p')) {
      continue;
    }

    const paragraphs = Array.from(candidate.querySelectorAll('p'));
    const chars = paragraphs.reduce(
      (total, node) => total + (node.textContent?.length ?? 0),
      0,
    );
    if (chars < 400) {
      continue;
    }

    const linkChars = Array.from(candidate.querySelectorAll('a')).reduce(
      (total, node) => total + (node.textContent?.length ?? 0),
      0,
    );
    const density = linkChars / Math.max(chars, 1);
    if (density > 0.4) {
      continue;
    }

    const candidateScore =
      chars * (1 - density) * (candidate.matches('article') ? 1.25 : 1);
    if (candidateScore > score) {
      score = candidateScore;
      best = candidate;
    }
  }

  if (!best) {
    return null;
  }

  const text = Array.from(best.querySelectorAll('p, blockquote, pre'))
    .map((node) => normalize(node.textContent))
    .filter((value) => value.length > 0 && !JUNK_PATTERN.test(value))
    .join('\n\n');
  if (!text) {
    return null;
  }

  const title =
    normalize(best.querySelector('h1, h2, h3')?.textContent) ||
    'Current chapter';
  return {
    title: cleanTitle(document.title),
    chapters: [{id: 'current', title, text, element: best}],
    source: 'generic',
  };
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanTitle(title: string): string {
  return title.replace(/\s*[|—-]\s*.+$/, '').trim() || 'Untitled book';
}
