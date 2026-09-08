import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {prepareDocumentEdit,validateRenderableDocument} from './editor';
import {previewDocument} from './previewDocument';
import {VisualChart} from './Chart';
it('regenerates edited encodings instead of rendering a stale saved Gallery snapshot',()=>{
 const raw=previewDocument(JSON.parse(readFileSync('src/datav3/basic_charts/01_simple_bar_chart.json','utf8')));
 const current=validateRenderableDocument(raw);
 const original=structuredClone(current);
 const edited=structuredClone(current);
 (edited.data_specification as any)['0'].non_layout_specification.fill={scale:'fix',fix:'#ff0000'};
 const next=prepareDocumentEdit(current,edited);
 expect(next.view_data.marks).not.toEqual(current.view_data.marks);
 const chart=new VisualChart();chart.parseDSL(next);chart.restoreViewSnapshot(next.view_data as any);
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');chart.initSVGDOM(svg);chart.drawData();
 expect(svg.querySelector('[fill="#ff0000"]')).not.toBeNull();
 expect(current).toEqual(original);
});
it('rejects an invalid edit before it replaces the current visualization',()=>{
 const current=validateRenderableDocument(previewDocument(JSON.parse(readFileSync('src/datav3/basic_charts/01_simple_bar_chart.json','utf8'))));
 const original=JSON.stringify(current);
 expect(()=>prepareDocumentEdit(current,{...current,coordinate:'invalid'})).toThrow();
 expect(JSON.stringify(current)).toBe(original);
});
