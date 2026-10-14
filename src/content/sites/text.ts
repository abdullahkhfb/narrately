/**
 * @fileoverview Text and chapter-part helpers shared by site adapters.
 */

import type {Chapter} from '../../shared/types';

const JUNK_PATTERN =
  /^(share|comments?|login|sign ?in|register|previous|next|back|home|table of contents|copyright|©|advertisement|subscribe|follow us|all rights reserved)\b/i;
const CHAPTER_PREFIX = /^chapter\s+\d+\s*:\s*/i;
const PART_SUFFIX =
  /\s*\(part\s+(one|two|three|four|five|six|seven|eight|nine|ten)\)$/i;

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

export interface ChapterPartInfo {
  readonly baseKey: string;
  readonly displayTitle: string;
  readonly partNumber: number | undefined;
}

export interface ChapterPartState {
  readonly baseKey: string;
  readonly number: number;
}

export interface MergedChapterPart {
  readonly displayTitle: string;
  readonly nextPart: ChapterPartState | null;
  readonly merged: boolean;
}

/** Collapses whitespace and trims; tolerates missing text. */
export function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** Strips a trailing site name such as " | Site" from a document title. */
export function cleanTitle(title: string): string {
  return title.replace(/\s*[|—-]\s*.+$/, '').trim() || 'Untitled book';
}

/** Extracts narratable `p`, `blockquote`, and `pre` paragraphs under `root` in a single pass. */
export function readParagraphs(root: Element): string[] {
  const nodes = root.querySelectorAll('p, blockquote, pre');
  const paragraphs: string[] = [];
  for (const node of nodes) {
    const text = normalize(node.textContent);
    if (text.length > 0 && !JUNK_PATTERN.test(text)) {
      paragraphs.push(text);
    }
  }
  return paragraphs;
}

/** True when `hostname` is `host` or one of its subdomains. */
export function hostMatches(hostname: string, host: string): boolean {
  const name = hostname.toLowerCase();
  return name === host || name.endsWith(`.${host}`);
}

/** Parses optional `(Part One..Ten)` metadata from a chapter heading. */
export function parseChapterPart(title: string): ChapterPartInfo {
  const partMatch = title.match(PART_SUFFIX);
  const stripped = partMatch ? title.replace(PART_SUFFIX, '').trim() : title;
  const baseKey = stripped.replace(CHAPTER_PREFIX, '').trim().toLowerCase();
  const partLabel = partMatch?.[1]?.toLowerCase();
  return {
    baseKey,
    displayTitle: stripped,
    partNumber: partLabel ? PART_NUMBER[partLabel] : undefined,
  };
}

/** Merges sequential `(Part One..Ten)` sections into the preceding chapter when they match. */
export function mergeChapterPart(
  title: string,
  text: string,
  previousChapter: Chapter | undefined,
  previousPart: ChapterPartState | null,
): MergedChapterPart {
  const {baseKey, displayTitle, partNumber} = parseChapterPart(title);
  if (
    previousChapter !== undefined &&
    partNumber !== undefined &&
    previousPart !== null &&
    previousPart.baseKey === baseKey &&
    previousPart.number + 1 === partNumber
  ) {
    previousChapter.text += `\n\n${text}`;
    return {
      displayTitle,
      nextPart: {baseKey, number: partNumber},
      merged: true,
    };
  }

  return {
    displayTitle,
    nextPart: partNumber === 1 ? {baseKey, number: 1} : null,
    merged: false,
  };
}
