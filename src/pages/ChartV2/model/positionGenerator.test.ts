import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {generatePositions, type GaussianMixture} from './positionGenerator';
import {VisualChart} from './Chart';
import {validateDocument} from './document';
import {generateRect} from '@/utils/mark';
import type {DrawDataCartesian} from '../type';
const gaussian:GaussianMixture={type:'gaussian_mixture',seed:123,background_weight:0,clusters:[{weight:1,center:[50,50],spread:[8,8],correlation:0.9}]};
const read=(name:string,category='composite')=>JSON.parse(readFileSync(`src/datav3/${category}/${name}.json`,'utf8'));
const pairs=[['02_radial_bar_chart','basic_charts'],['02_scatter_plot_matrix','composite'],['03_marginal_histograms','composite']];
describe('selected Gallery cards 03–05',()=>{
 it.each(pairs)('%s preserves its saved view on serialization and reload',(name,category)=>{
  const doc=read(name,category);expect(validateDocument(doc,{requireEnhancedFields:true,validateReferences:true}).issues).toEqual([]);
  const chart=new VisualChart();chart.parseDSL(JSON.parse(JSON.stringify(doc)));chart.restoreViewSnapshot(doc.view_data);
  expect(chart.createViewSnapshot()).toEqual(doc.view_data);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');chart.initSVGDOM(svg);chart.drawData();
  expect(svg.outerHTML).not.toMatch(/NaN|Infinity/);
 });
 it('renders three arcs with the selected angular extents',()=>{
  const doc=read('02_radial_bar_chart','basic_charts');const chart=new VisualChart();chart.parseDSL(doc);
  const marks=chart.dsl_data['0'] as any[];
  doc.data_specification['0'].layout_specification.angle.data_values.forEach((v:number,i:number)=>expect(marks[i].a2-marks[i].a1).toBeCloseTo(v*3.6));
 });
 it('retains the exported marginal values and renders zero-height bars as zero',()=>{
  const doc=read('03_marginal_histograms');const chart=new VisualChart();chart.parseDSL(doc);
  expect((chart.dsl_data['0-1'] as DrawDataCartesian[]).map(m=>m.y2-m.y1)).toEqual(doc.data_specification['0-1'].layout_specification.y.data_values);
  expect((chart.dsl_data['0-2'] as DrawDataCartesian[]).map(m=>m.x2-m.x1)).toEqual(doc.data_specification['0-2'].layout_specification.x.data_values);
  const rect=generateRect({x:{d1:0,d2:10},y:{d1:0,d2:0}},{transXY:(x,y)=>({x,y})},{});
  expect(rect.attr('height')).toBe('0');
 });
 it('assigns distinct generators to panels by visual row/column, not expansion order',()=>{
  const doc=read('02_scatter_plot_matrix');const chart=new VisualChart();chart.parseDSL(doc);
  const panels=Object.values(chart.dsl_container).filter(c=>c.if_leaf).sort((a,b)=>b.coordinate_system.y2-a.coordinate_system.y2||a.coordinate_system.x1-b.coordinate_system.x1);
  expect(panels).toHaveLength(9);
  const configs=doc.data_specification['0-a-0'].instance_position_generators;
  panels.forEach((panel,i)=>{
   const marks=chart.dsl_data[panel.container_id] as DrawDataCartesian[];expect(marks).toHaveLength(392);
   const expected=generatePositions(configs[i],392);
   marks.forEach((m,j)=>{expect((m.x1+m.x2)/2).toBeCloseTo(expected[j][0]);expect((m.y1+m.y2)/2).toBeCloseTo(expected[j][1]);});
  });
  const first=panels[0].container_id;chart.dsl_cache.anchor_point[first].x[0]=42;chart.parseData();
  const mark=(chart.dsl_data[first] as DrawDataCartesian[])[0];expect((mark.x1+mark.x2)/2).toBe(42);
 });
 it('rejects missing per-panel generator configurations',()=>{
  const doc=read('02_scatter_plot_matrix');doc.data_specification['0-a-0'].instance_position_generators.pop();
  expect(()=>new VisualChart().parseDSL(doc)).toThrow(/per panel/);
 });
});
describe('Gaussian mixture sampler',()=>{
 it('is reproducible, bounded, seed-dependent, and emits the requested count',()=>{
  const a=generatePositions(gaussian,400);expect(a).toHaveLength(400);expect(a).toEqual(generatePositions(gaussian,400));
  expect(a).not.toEqual(generatePositions({...gaussian,seed:456},400));
  expect(a.flat().every(v=>Number.isFinite(v)&&v>=0&&v<=100)).toBe(true);
 });
 it('respects perfect positive and negative correlation',()=>{
  for(const correlation of [1,-1]){
   const points=generatePositions({...gaussian,clusters:[{...gaussian.clusters[0],correlation}]},200);
   points.forEach(([x,y])=>expect(correlation===1?x+y*-1:x+y).toBeCloseTo(correlation===1?0:100));
  }
 });
 it('normalizes relative mixture weights and supports a pure background',()=>{
  const scaled={...gaussian,clusters:[{...gaussian.clusters[0],weight:10}]};
  expect(generatePositions(scaled,100)).toEqual(generatePositions(gaussian,100));
  const background=generatePositions({...gaussian,background_weight:1,clusters:[{...gaussian.clusters[0],weight:0}]},100);
  expect(Math.min(...background.map(v=>v[0]))).toBeLessThan(10);expect(Math.max(...background.map(v=>v[0]))).toBeGreaterThan(90);
 });
 it('rejects invalid covariance, nonfinite parameters and zero total weight',()=>{
  for(const change of [{correlation:1.1},{spread:[-1,2]},{center:[Infinity,0]},{weight:-1}]){
   expect(()=>generatePositions({...gaussian,clusters:[{...gaussian.clusters[0],...change}]} as GaussianMixture,10)).toThrow();
  }
  expect(()=>generatePositions({...gaussian,clusters:[{...gaussian.clusters[0],weight:0}]},10)).toThrow();
 });
});
