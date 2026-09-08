import {readFileSync} from 'node:fs';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {VisualChart} from './Chart';import {buildDataModeCandidate} from './dataMode';import {validateDocument} from './document';
import {changeDslFile,handleChangeContainer,applyDataChanges,useChartStore} from './editor';
import {DataFormProp} from '../type';
const read=():any=>JSON.parse(readFileSync('src/datav3/composite/07_iForest.json','utf8'));
afterEach(()=>{vi.unstubAllGlobals();useChartStore.setState({...useChartStore.getInitialState(),chart:new VisualChart()},true);});
describe('iForest connections and reference data',()=>{
 it('renders hidden container links in SVG coordinates without layout measurements',()=>{
  const doc=read(),chart=new VisualChart();chart.parseDSL(doc);chart.restoreViewSnapshot(doc.view_data);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  const rect=vi.spyOn(svg,'getBoundingClientRect');chart.initSVGDOM(svg);chart.drawData();
  svg.querySelectorAll<SVGElement>('.container').forEach(n=>n.style.display='none');chart.drawData();
  expect(rect).not.toHaveBeenCalled();
  const paths=svg.querySelectorAll('g.chart-link path');expect(paths).toHaveLength(8);
  expect(paths[0].getAttribute('d')).toMatch(/M 306\.5 325\s+C/);
  paths.forEach(p=>expect(p.getAttribute('d')).not.toMatch(/NaN|Infinity/));
  expect(svg.querySelectorAll('g.id_0-0a-0 rect')).toHaveLength(8);
 });
 it('retains forward topology across sampling, reload and exact reference restoration',()=>{
  const ref=read();
  for(const seed of ['tree1','tree2','tree3']){
   const doc=buildDataModeCandidate(ref,'generated',seed) as any;
   const chart=new VisualChart();chart.parseDSL(doc);chart.restoreViewSnapshot(doc.view_data);
   expect(chart.createViewSnapshot()).toEqual(doc.view_data);
   const pairs=doc.view_data.marks['0-0'].map((l:any)=>[l.source,l.target]);
   expect(pairs).toEqual(ref.data_specification['0-0'].layout_specification.link_values);
   for(const [a,b] of pairs){
    const cs=doc.view_data.containers[a.slice(10)].coordinate_system,ct=doc.view_data.containers[b.slice(10)].coordinate_system;
    expect(cs.x2).toBeLessThan(ct.x1);
   }
   expect(doc.view_data.marks['0-0a-0']).not.toEqual(ref.view_data.marks['0-0a-0']);
   expect(buildDataModeCandidate(doc,'reference').view_data).toEqual(ref.view_data);
  }
 });
 it('validates endpoints and supports an explicitly empty link set',()=>{
  const bad=read();bad.data_specification['0-0'].layout_specification.link_values=[['container_missing','container_0-4']];
  expect(()=>new VisualChart().parseDSL(bad)).toThrow(/missing endpoint/);
  bad.data_specification['0-0'].layout_specification.link_values=[['bad']];expect(validateDocument(bad).valid).toBe(false);
  bad.data_specification['0-0'].layout_specification.link_values=[];
  const chart=new VisualChart();chart.parseDSL(bad);expect(chart.dsl_data['0-0']).toEqual([]);
 });
 it('saves edited link pairs into the DSL so new samples retain user topology',async()=>{
  let disk=read();vi.stubGlobal('fetch',vi.fn(async(_url:any,init:any)=>{
   if(init?.method==='PUT'){disk=JSON.parse(init.body).content;return {ok:true,json:async()=>({hash:'h2',success:true})};}
   return {ok:true,json:async()=>({content:disk,hash:'h1',category:'composite'})};
  }));
  useChartStore.setState({...useChartStore.getInitialState(),chart:new VisualChart()},true);
  await changeDslFile('07_iForest');handleChangeContainer('0-0');
  const pairs=[['container_0-0a','container_0-2a']];
  useChartStore.setState({currentDataFormProp:DataFormProp.LINK_NODES});
  await applyDataChanges('mark',[pairs] as any);
  expect(disk.data_specification['0-0'].layout_specification.link_values).toEqual(pairs);
  const sample=buildDataModeCandidate(disk,'generated','edited') as any;
  expect(sample.view_data.marks['0-0']).toHaveLength(1);
 });
});
