/**
 * @fileoverview Best-effort fallback for sites without a dedicated adapter.
 */

import type {Book} from '../../shared/types';
import {cleanTitle, normalize, readParagraphs} from './text';
import type {SiteAdapter} from './types';

const MIN_PARAGRAPH_CHARS = 400;
const MAX_LINK_DENSITY = 0.4;
const ARTICLE_BONUS = 1.25;
const CANDIDATE_SELECTOR =
  'article, main, [role="main"], [class*="content" i], [class*="story" i]';

function scoreCandidate(candidate: Element): number {
  const paragraphs = candidate.querySelectorAll('p');
  if (paragraphs.length === 0) {
    return 0;
  }

  let chars = 0;
  for (const node of paragraphs) {
    chars += node.textContent?.length ?? 0;
  }
  if (chars < MIN_PARAGRAPH_CHARS) {
    return 0;
  }

  let linkChars = 0;
  for (const node of candidate.querySelectorAll('a')) {
    linkChars += node.textContent?.length ?? 0;
  }
  const density = linkChars / chars;
  if (density > MAX_LINK_DENSITY) {
    return 0;
  }

  return (
    chars *
    (1 - density) *
    (candidate.matches('article') ? ARTICLE_BONUS : 1)
  );
}

/** Fallback used when no site adapter recognizes the page. */
export const genericAdapter: SiteAdapter = {
  id: 'generic',
  name: 'Generic page',
  hosts: [],

  detect(doc: Document): Book | null {
    let best: Element | null = null;
    let bestScore = 0;

    for (const candidate of doc.querySelectorAll(CANDIDATE_SELECTOR)) {
      const candidateScore = scoreCandidate(candidate);
      if (candidateScore > bestScore) {
        bestScore = candidateScore;
        best = candidate;
      }
    }

    if (doc.body) {
      const bodyScore = scoreCandidate(doc.body);
      if (bodyScore > bestScore) {
        best = doc.body;
      }
    }

    if (!best) {
      return null;
    }

    const text = readParagraphs(best).join('\n\n');
    if (!text) {
      return null;
    }

    const title =
      normalize(best.querySelector('h1, h2, h3')?.textContent) ||
      'Current chapter';
    return {
      title: cleanTitle(doc.title),
      chapters: [{id: 'current', title, text, element: best}],
      source: 'generic',
    };
  },
};
