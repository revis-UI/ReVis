import {it,expect} from 'vitest';
import {fitPreviewSVG} from './svgViewport';
it('frames a wide drawing at its actual position with padding for axes',()=>{
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.getBBox=()=>({x:0,y:600,width:1000,height:400}) as DOMRect;
 fitPreviewSVG(svg);
 expect(svg.getAttribute('viewBox')).toBe('-25 575 1050 450');
 expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
});
