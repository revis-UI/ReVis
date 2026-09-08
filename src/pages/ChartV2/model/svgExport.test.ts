import {it,expect} from 'vitest';
import {serializePreviewSVG} from './svgExport';
it('preserves hidden guides in the standalone SVG without modifying the preview',()=>{
 const style=document.createElement('style');style.textContent='.export-test .container {opacity:0}';document.head.appendChild(style);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('export-test');
 svg.innerHTML='<rect class="container" width="100" height="100"/><circle r="10"/>';document.body.appendChild(svg);
 try {
  const result=new DOMParser().parseFromString(serializePreviewSVG(svg),'image/svg+xml');
  expect(result.querySelector('rect')?.getAttribute('style')).toContain('opacity: 0');
  expect(svg.querySelector('rect')?.getAttribute('style')).toBeNull();
  expect(result.querySelector('circle')).not.toBeNull();
  expect(result.querySelector('parsererror')).toBeNull();
 } finally {svg.remove();style.remove();}
});
