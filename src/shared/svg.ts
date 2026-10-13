/** Creates an SVG node from a bundled SVG asset. */
export function parseSvg(source: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error('Invalid bundled SVG asset.');
  }
  return document.importNode(svg, true);
}
