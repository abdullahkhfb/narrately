/**
 * @fileoverview Best-effort fallback for sites without a dedicated adapter.
 *
 * It scores likely content containers and treats the winner as a single
 * chapter. Behavior on unfamiliar layouts is not guaranteed.
 */

import type {Book} from '../../shared/types';
import type {SiteAdapter} from './types';
import {cleanTitle, normalize, readParagraphs} from './text';

const MIN_PARAGRAPH_CHARS = 400;
const MAX_LINK_DENSITY = 0.4;
const ARTICLE_BONUS = 1.25;

/** Fallback used when no site adapter recognizes the page. */
export const genericAdapter: SiteAdapter = {
  id: 'generic',
  name: 'Generic page',
  hosts: [],

  detect(doc: Document): Book | null {
    const candidates = Array.from(
      doc.querySelectorAll(
        'article, main, [role="main"], [class*="content" i], [class*="story" i]',
      ),
    );
    candidates.push(doc.body);

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
      if (chars < MIN_PARAGRAPH_CHARS) {
        continue;
      }

      const linkChars = Array.from(candidate.querySelectorAll('a')).reduce(
        (total, node) => total + (node.textContent?.length ?? 0),
        0,
      );
      const density = linkChars / Math.max(chars, 1);
      if (density > MAX_LINK_DENSITY) {
        continue;
      }

      const candidateScore =
        chars * (1 - density) * (candidate.matches('article') ? ARTICLE_BONUS : 1);
      if (candidateScore > score) {
        score = candidateScore;
        best = candidate;
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
