/**
 * @fileoverview Shared DOM, SVG, and control helpers across extension UIs.
 */

import {VOICE_CATALOG} from '../voices/catalog';

const svgCache = new Map<string, SVGSVGElement>();

/** Looks up a required element by id within `root` and verifies its runtime type. */
export function getRequiredElement<T extends Element>(
  root: ParentNode,
  id: string,
  elementType: {new (): T},
): T {
  const element =
    root instanceof Document
      ? root.getElementById(id)
      : root.querySelector(`#${id}`);
  if (!(element instanceof elementType)) {
    throw new Error(`Missing required element: #${id}`);
  }
  return element;
}

/** Parses and caches a bundled SVG asset, returning a cloned SVG node. */
export function parseSvg(source: string): SVGSVGElement {
  let prototype = svgCache.get(source);
  if (!prototype) {
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = parsed.documentElement;
    if (!(svg instanceof SVGSVGElement)) {
      throw new Error('Invalid bundled SVG asset.');
    }
    prototype = document.importNode(svg, true);
    svgCache.set(source, prototype);
  }
  return prototype.cloneNode(true) as SVGSVGElement;
}

/** Populates a `<select>` element with the curated voice catalog. */
export function populateVoiceSelect(select: HTMLSelectElement): void {
  const fragment = document.createDocumentFragment();
  for (const item of VOICE_CATALOG) {
    const option = document.createElement('option');
    option.value = item.id;
    option.title = item.description;
    option.textContent = `${item.name} · ${item.language}`;
    fragment.append(option);
  }
  select.append(fragment);
}

/** Updates `aria-pressed` states on speed preset buttons. */
export function syncSpeedChips(container: ParentNode, speed: number): void {
  const buttons = container.querySelectorAll<HTMLButtonElement>('button[data-speed]');
  for (const chip of buttons) {
    const isPressed = Math.abs(Number(chip.dataset['speed']) - speed) < 0.001;
    chip.setAttribute('aria-pressed', String(isPressed));
  }
}
