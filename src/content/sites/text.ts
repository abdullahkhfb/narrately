/**
 * @fileoverview Text helpers shared by site adapters.
 */

const JUNK_PATTERN =
  /^(share|comments?|login|sign ?in|register|previous|next|back|home|table of contents|copyright|©|advertisement|subscribe|follow us|all rights reserved)\b/i;

/** Collapses whitespace and trims; tolerates missing text. */
export function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** Strips a trailing site name such as " | Site" from a document title. */
export function cleanTitle(title: string): string {
  return title.replace(/\s*[|—-]\s*.+$/, '').trim() || 'Untitled book';
}

/**
 * Returns the narratable paragraphs under `root`: `p`, `blockquote` and `pre`
 * text, normalized, without empty or navigation-like lines.
 */
export function readParagraphs(root: Element): string[] {
  return Array.from(root.querySelectorAll('p, blockquote, pre'))
    .map((node) => normalize(node.textContent))
    .filter((text) => text.length > 0 && !JUNK_PATTERN.test(text));
}
