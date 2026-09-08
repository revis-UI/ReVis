/** Keep the downloaded SVG consistent with the displayed container visibility. */
export function serializePreviewSVG(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg');
  const sources = svg.querySelectorAll<SVGElement>('.container');
  const targets = clone.querySelectorAll<SVGElement>('.container');
  sources.forEach((source, index) => {
    const computed = window.getComputedStyle(source);
    const target = targets[index];
    target.style.opacity = computed.opacity;
    target.style.display = computed.display;
    target.style.visibility = computed.visibility;
  });
  return new XMLSerializer().serializeToString(clone);
}
