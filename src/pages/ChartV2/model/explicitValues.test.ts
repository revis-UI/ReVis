import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {VisualChart} from './Chart';
import {migrateDocument, validateDocument} from './document';
import {createSeededRandom} from './seededRandom';
import {validateExplicitValues} from './explicitValues';
import type {DrawDataCartesian, DrawDataPolar} from '../type';

const cases = ['01_simple_bar_chart','06_grouped_bar_chart','14_pie_chart','15_donut_chart','16_line_chart','12_diverging_stacked_bar'];
const fixture = (name:string) => JSON.parse(readFileSync(`src/datav3/${name.startsWith('12_')?'composite':'basic_charts'}/${name}.json`, 'utf8'));
function render(name:string, seed='first') {
 const chart=new VisualChart();chart.setRandomGenerator(createSeededRandom(seed).next);chart.parseDSL(fixture(name));return chart;
}
describe('reviewed explicit recovery data',()=>{
 it.each(cases)('%s is seed-independent and survives snapshot reload',name=>{
  const a=render(name), b=render(name,'different seed');
  expect(a.createViewSnapshot()).toEqual(b.createViewSnapshot());
  const doc=migrateDocument(fixture(name),{viewData:a.createViewSnapshot() as any});
  expect(validateDocument(doc,{requireEnhancedFields:true,validateReferences:true}).issues).toEqual([]);
  const loaded=JSON.parse(JSON.stringify(doc));b.reset();b.parseDSL(loaded);b.restoreViewSnapshot(loaded.view_data);
  expect(b.createViewSnapshot()).toEqual(a.createViewSnapshot());
 });
 it('reproduces the nine bar heights, including the two peaks and trough',()=>{
  const marks=render(cases[0]).dsl_data['0'] as DrawDataCartesian[];
  expect(marks.map(m=>m.y2-m.y1)).toEqual([28,55,43,90,81,53,19,87,52]);
 });
 it('uses primary/secondary matrix values without broadcasting groups',()=>{
  const rows=render(cases[1]).dsl_data['0'] as DrawDataCartesian[][];
  const expected=[[9,54.6,81.8],[63.6,18.2,100],[54.6,9,18.2]];
  rows.forEach((row,i)=>row.forEach((m,j)=>expect(m.y2-m.y1).toBeCloseTo(expected[i][j])));
 });
 it.each(['14_pie_chart','15_donut_chart'])('%s has six stable category colors and closes the circle',name=>{
  const marks=render(name).dsl_data['0'] as DrawDataPolar[];
  expect(marks[0].a1).toBe(0);expect(marks[5].a2).toBeCloseTo(360);
  marks.slice(1).forEach((m,i)=>expect(m.a1).toBeCloseTo(marks[i].a2));
  expect(marks.map(m=>m.props.fill)).toEqual(['#4C78A8','#F58518','#E45756','#72B7B2','#54A24B','#EECA3B']);
  expect(marks.every(m=>m.props.opacity===1)).toBe(true);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const chart=render(name);chart.initSVGDOM(svg);chart.drawData();
  expect([...svg.querySelectorAll('g.id_0 path')].map(p=>p.getAttribute('opacity'))).toEqual(Array(6).fill('1'));
 });
 it('places recovered line observations on y and keeps x increasing',()=>{
  const rows=render('16_line_chart').dsl_data['0'] as DrawDataCartesian[][];
  const expected=fixture('16_line_chart').data_specification['0'].layout_specification.y.anchor_values;
  rows.forEach((row,i)=>row.forEach((m,j)=>{
   expect(m.x1).toBeCloseTo(j*11.11);expect(m.x2).toBeCloseTo(m.x1);
   expect(m.y1).toBeCloseTo(expected[i][j]);expect(m.y2).toBeCloseTo(m.y1);
  }));
 });
 it('lets subsequent data-control cache edits override initial recovery values',()=>{
  const chart=render('01_simple_bar_chart');chart.dsl_cache.size_range['0'].y[0]=42;chart.parseData();
  expect((chart.dsl_data['0'] as DrawDataCartesian[])[0].y2).toBe(42);
  const line=render('16_line_chart');line.dsl_cache.anchor_point['0'].y[0][0][0]=70;line.parseData();
  expect((line.dsl_data['0'] as DrawDataCartesian[][])[0][0].y1).toBe(70);
 });
 it('preserves explicit zero values',()=>{
  const doc=fixture('01_simple_bar_chart');doc.data_specification['0'].layout_specification.y.data_values[0]=0;
  const chart=new VisualChart();chart.parseDSL(doc);expect((chart.dsl_data['0'] as DrawDataCartesian[])[0].y2).toBe(0);
 });
 it('rejects malformed, nonfinite, negative-size and mismatched matrix inputs',()=>{
  for(const values of [[1], [NaN,2], [-1,2], [[1,2],[3]]])expect(()=>validateExplicitValues(values,2,2,'test',true)).toThrow();
  expect(()=>validateExplicitValues([0,1],2,undefined,'test',true)).not.toThrow();
  expect(()=>validateExplicitValues([NaN,2],2,undefined,'test',true)).toThrow();
  expect(()=>validateExplicitValues([-1,2],2,undefined,'test',true)).toThrow();
  const doc=fixture('01_simple_bar_chart');doc.data_specification['0'].layout_specification.y.data_values=[1];
  expect(()=>new VisualChart().parseDSL(doc)).toThrow(/data_values/);
 });
});
