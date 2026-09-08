/** Fit the actual drawing, including axes, rather than an always-square canvas. */
export function fitPreviewSVG(svg: SVGSVGElement): void {
  if (typeof svg.getBBox !== 'function') return;
  try {
    const {x,y,width,height} = svg.getBBox();
    if (![x,y,width,height].every(Number.isFinite) || width <= 0 || height <= 0) return;
    const padding = Math.max(width,height) * .025;
    svg.setAttribute('viewBox', `${x-padding} ${y-padding} ${width+2*padding} ${height+2*padding}`);
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  } catch { /* Detached validation SVGs may not have measurable geometry. */ }
}
