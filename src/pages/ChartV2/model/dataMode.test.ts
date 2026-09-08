import {readFileSync,readdirSync} from 'node:fs';
import {describe,expect,it,vi,afterEach} from 'vitest';
import {VisualChart} from './Chart';
import {buildDataModeCandidate} from './dataMode';
import {resolveSharedData,validateSharedData} from './dataSources';
import {migrateDocument,commitDocument,undoDocument,redoDocument,validateDocument} from './document';
import {applyDataChanges,changeCoordinateGuides,changeDataMode,changeDslFile,changeDslJson,undoEditorDocument,redoEditorDocument,useChartStore} from './editor';
import {DataFormProp} from '../type';
const read=(name='04_line_with_highlight',category='composite'):any=>{
 const raw=JSON.parse(readFileSync(`src/datav3/${category}/${name}.json`,'utf8'));
 // A developer may save a generated sample while browsing the canonical examples.
 // Exercise reference transitions from its saved reference without changing that file.
 const ref=raw.data_mode==='generated'?buildDataModeCandidate(raw,'reference'):raw;
 return migrateDocument({...ref,history:{cursor:0,entries:[]}});
};
const centers=(doc:any,id:string)=>doc.view_data.marks[id].map((m:any)=>[(m.x1+m.x2)/2,(m.y1+m.y2)/2]);
function aligned(doc:any){
 const line=centers(doc,'0-1'),dots=centers(doc,'0-2');expect(line).toHaveLength(20);
 line.forEach((p:number[],i:number)=>p.forEach((v,j)=>expect(dots[i][j]).toBeCloseTo(v,10)));
}
describe('reference and generated data modes',()=>{
 for(const category of ['basic_charts','composite']) for(const file of readdirSync('src/datav3/'+category).filter(f=>f.endsWith('.json'))) {
  it('round-trips data mode for '+file,()=>{
   const ref=read(file.replace('.json',''),category);
   const generated=buildDataModeCandidate(ref,'generated','all-fixtures');
   expect(validateDocument(generated).valid).toBe(true);
   expect(JSON.stringify(generated.view_data)).not.toMatch(/NaN|Infinity/);
   const restored=buildDataModeCandidate(generated,'reference');
   expect(restored.view_data).toEqual((generated.reference_state as {view:unknown}).view);
  });
 }

 it('keeps shared points on the line across new seeds and reference restoration',()=>{
  const reference=read();aligned(reference);
  const a=buildDataModeCandidate(reference,'generated','a');
  const b=buildDataModeCandidate(a,'generated','b');
  aligned(a);aligned(b);expect(centers(a,'0-1')).not.toEqual(centers(b,'0-1'));
  expect(a.data_sources).toEqual(reference.data_sources);expect(a.data_specification).toEqual(reference.data_specification);
  expect(buildDataModeCandidate(b,'reference').view_data).toEqual(reference.view_data);
  const same=buildDataModeCandidate(reference,'generated','a');expect(same.view_data).toEqual(a.view_data);
  const reloaded=JSON.parse(JSON.stringify(b));const chart=new VisualChart();chart.parseDSL(reloaded);chart.restoreViewSnapshot(reloaded.view_data);
  expect(chart.createViewSnapshot()).toEqual(b.view_data);
 });
 it('shares only bound fields while leaving the other axis independent',()=>{
  const reference=read();
  delete reference.data_specification['0-2'].data_ref.y;
  const first=buildDataModeCandidate(reference,'generated','partial-a');
  const second=buildDataModeCandidate(first,'generated','partial-b');
  for(const doc of [first,second]) {
   const line=centers(doc,'0-1'),dots=centers(doc,'0-2');
   line.forEach((p:number[],i:number)=>expect(dots[i][0]).toBeCloseTo(p[0],10));
   expect(dots.map((p:number[])=>p[1])).not.toEqual(line.map((p:number[])=>p[1]));
   const chart=new VisualChart();chart.parseDSL(doc);chart.restoreViewSnapshot(doc.view_data as any);
   expect(chart.createViewSnapshot()).toEqual(doc.view_data);
  }
  expect(buildDataModeCandidate(second,'reference').view_data).toEqual(reference.view_data);
 });
 it('keeps the line centered inside a visible band through sampling and reload',()=>{
  const reference=read('14_line_and_area','composite');
  for(const seed of ['band-a','band-b','band-c']) {
   const doc=buildDataModeCandidate(reference,'generated',seed);
   const band=doc.view_data.marks['0-0'] as any[],line=doc.view_data.marks['0-1'] as any[];
   expect(line).toHaveLength(12);
   expect(new Set(line.map(p=>p.x1)).size).toBe(12);
   line.forEach((p,i)=>{
    expect(p.x1).toBeCloseTo(band[i].x1,10);
    expect(p.y1).toBeCloseTo((band[i].y1+band[i].y2)/2,10);
    expect(band[i].y1).toBeLessThan(p.y1);
    expect(band[i].y2).toBeGreaterThan(p.y1);
   });
   const chart=new VisualChart();chart.parseDSL(doc);chart.restoreViewSnapshot(doc.view_data as any);
   expect(chart.createViewSnapshot()).toEqual(doc.view_data);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   chart.initSVGDOM(svg);chart.drawData();
   expect(svg.querySelectorAll('g.id_0-0 path')).toHaveLength(1);
   expect(svg.querySelectorAll('g.id_0-1 path')).toHaveLength(1);
   expect(svg.outerHTML).not.toMatch(/NaN|Infinity/);
   expect(buildDataModeCandidate(doc,'reference').view_data).toEqual(reference.view_data);
  }
 });
 it('keeps stacked area totals inside the viewport without flattening the upper envelope',()=>{
  const ref=read('18_stacked_area','basic_charts');
  for(let seed=0;seed<12;seed++) {
   const generated=buildDataModeCandidate(ref,'generated','stack-bounds-'+seed);
   for(const doc of [generated,buildDataModeCandidate(generated,'reference')]) {
    const rows=doc.view_data.marks['0'] as any[][];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveLength(40);
    rows.flat().forEach(p=>{
     expect(p.x1).toBeGreaterThanOrEqual(0);
     expect(p.x2).toBeLessThanOrEqual(100+1e-9);
     expect(p.y1).toBeGreaterThanOrEqual(0);
     expect(p.y2).toBeLessThanOrEqual(90+1e-9);
    });
    for(let j=0;j<40;j++){
     expect(rows[0][j].y1).toBe(0);
     expect(rows[1][j].y1).toBeCloseTo(rows[0][j].y2);
     expect(rows[2][j].y1).toBeCloseTo(rows[1][j].y2);
    }
    expect(new Set(rows[2].map(p=>p.y2)).size).toBeGreaterThan(1);
    expect(rows[0][39].x1).toBeCloseTo(100);
   }
  }
 });
 it('binds spoke lengths to closed perimeter radii across samples and reload',()=>{
  const reference=read('20_EnsembleLens','composite');
  for(const seed of ['ring-a','ring-b','ring-c']) {
   const doc=buildDataModeCandidate(reference,'generated',seed);
   const bars=doc.view_data.marks['0-1'] as any[],line=doc.view_data.marks['0-3'] as any[];
   expect(bars).toHaveLength(16);expect(line).toHaveLength(16);
   bars.forEach((b,i)=>{
    expect(b.r1).toBe(0);
    expect(b.r2).toBeCloseTo(line[i].r1,12);
    expect(b.a1).toBeCloseTo(line[i].a1,12);
   });
   const chart=new VisualChart();chart.parseDSL(doc);chart.restoreViewSnapshot(doc.view_data as any);
   expect(chart.createViewSnapshot()).toEqual(doc.view_data);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');chart.initSVGDOM(svg);chart.drawData();
   expect(svg.querySelector('g.id_0-3 path')!.getAttribute('d')).toMatch(/Z$/);
   expect(svg.querySelectorAll('g.id_0-1 line')).toHaveLength(16);
   expect(svg.outerHTML).not.toMatch(/NaN|Infinity/);
   expect(buildDataModeCandidate(doc,'reference').view_data).toEqual(reference.view_data);
  }
  const invalid=read('20_EnsembleLens');
  invalid.data_sources.outerRing.fields.height.values[0]=-1;
  expect(()=>validateSharedData(invalid)).toThrow(/non-negative/);
 });
 it('generates despite fixed arrays without deleting them',()=>{
  const reference=read('01_simple_bar_chart','basic_charts');const a=buildDataModeCandidate(reference,'generated','a'),b=buildDataModeCandidate(reference,'generated','b');
  expect(a.view_data.marks).not.toEqual(b.view_data.marks);expect(a.data_specification).toEqual(reference.data_specification);
  expect(buildDataModeCandidate(a,'reference').view_data).toEqual((a.reference_state as {view:unknown}).view);
 });
 it('resamples Gaussian patterns while preserving source parameters and outliers',()=>{
  const ref=read('08_bubble_plot_1','basic_charts');const a=buildDataModeCandidate(ref,'generated','a'),b=buildDataModeCandidate(ref,'generated','b');
  expect(centers(a,'0')).not.toEqual(centers(b,'0'));expect(a.data_specification).toEqual(ref.data_specification);
  const outliers=ref.data_specification['0'].position_generator.outliers;
  centers(a,'0').slice(-outliers.length).forEach((p:number[],i:number)=>p.forEach((v,j)=>expect(v).toBeCloseTo(outliers[i][j])));
 });
 it('returns to updated reference definitions rather than a stale backup after a DSL edit',()=>{
  const generated=buildDataModeCandidate(read(),'generated','a');(generated.data_sources as any).trend.fields.y.values[0]=40;
  const restored=buildDataModeCandidate(generated,'reference');aligned(restored);expect(centers(restored,'0-1')[0][1]).toBe(40);
 });
 it('records mode changes as reversible document history',()=>{
  const ref=read();const changed=commitDocument(ref,buildDataModeCandidate(ref,'generated','history'),{source:'data-control'}).document;
  expect(changed.history.entries).toHaveLength(1);
  const undone=undoDocument(changed).document;expect(undone.view_data).toEqual(ref.view_data);aligned(undone);
  const redone=redoDocument(undone).document;expect(redone.view_data).toEqual(changed.view_data);aligned(redone);
 });
 it('samples a shared field once per source/field and rejects invalid refs/counts',()=>{
  const doc=read();doc.data_mode='generated';doc.metadata.generation_seed='seed';
  expect(resolveSharedData(doc)).toEqual(resolveSharedData(doc));
  const invalid=read();invalid.data_specification['0-2'].data_ref.source='missing';expect(()=>validateSharedData(invalid)).toThrow(/source/);
  expect(validateDocument(invalid).valid).toBe(false);
  const count=read();count.data_sources.trend.count=19;expect(()=>validateSharedData(count)).toThrow();
  const field=read();field.data_specification['0-2'].data_ref.y='missing';expect(()=>validateSharedData(field)).toThrow(/field/);
 });
});

afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();useChartStore.setState({...useChartStore.getInitialState(),chart:new VisualChart(),dsl_json:undefined},true)});
async function setupEditor(name='04_line_with_highlight'){
 let disk=read(name);let saves=0;
 vi.stubGlobal('fetch',vi.fn(async(_url:any,init:any)=>{
  if(init?.method==='PUT'){disk=JSON.parse(init.body).content;saves++;return {ok:true,json:async()=>({hash:`h${saves}`,success:true})};}
  return {ok:true,json:async()=>({content:disk,hash:`h${saves}`,category:'composite'})};
 }));
 useChartStore.setState({...useChartStore.getInitialState(),chart:new VisualChart(),dsl_json:undefined},true);
 await changeDslFile(name as any);
 return ()=>({disk,saves});
}
describe('shared source editor transactions',()=>{
 it('edits a bound radial size and updates the perimeter endpoint',async()=>{
  const state=await setupEditor('20_EnsembleLens');
  useChartStore.setState({selectedContainerId:'0-1',currentDataFormProp:DataFormProp.Y_SIZE_RANGE});
  const sizes=Array.from({length:16},(_,i)=>10+i*5);
  await applyDataChanges('mark',[sizes] as any);
  const doc=state().disk;
  expect(doc.data_sources.outerRing.fields.height.values).toEqual(sizes);
  doc.view_data.marks['0-1'].forEach((b:any,i:number)=>{
   expect(b.r2*100).toBeCloseTo(sizes[i]);
   expect(b.r2).toBeCloseTo(doc.view_data.marks['0-3'][i].r1,12);
  });
 });

 for(const name of ['04_line_with_highlight','07_iForest']) it('saves coordinate visibility without changing '+name+' and supports undo',async()=>{
  const state=await setupEditor(name);const before=JSON.parse(JSON.stringify(useChartStore.getState().dsl_json));
  await changeCoordinateGuides({'0-1':{visible:true,x:true,y:false,grid:true}});
  expect(state().disk.coordinate_guides['0-1'].x).toBe(true);
  expect(state().disk.view_data).toEqual(before.view_data);
  expect(state().disk.metadata.generation_seed).toBe(before.metadata.generation_seed);
  await undoEditorDocument();expect(state().disk.coordinate_guides).toEqual(before.coordinate_guides);
 });

 it('saves, undo/redoes, and restores reference data through normal transactions',async()=>{
  const state=await setupEditor();const reference=JSON.parse(JSON.stringify(useChartStore.getState().dsl_json));
  await changeDataMode('generated');aligned(state().disk);expect(state().disk.data_mode).toBe('generated');
  await undoEditorDocument();expect(state().disk.view_data).toEqual(reference.view_data);
  await redoEditorDocument();aligned(state().disk);
  await changeDataMode('reference');expect(state().disk.view_data).toEqual(reference.view_data);
 });
 it('edits a shared source from JSON and refreshes both consumers',async()=>{
  const state=await setupEditor();const next=JSON.parse(JSON.stringify(useChartStore.getState().dsl_json));
  next.data_sources.trend.fields.y.values[2]=42;await changeDslJson(next);aligned(state().disk);expect(centers(state().disk,'0-1')[2][1]).toBe(42);
 });
 it('updates both consumers from a shared anchor Data Control edit',async()=>{
  const state=await setupEditor();useChartStore.setState({selectedContainerId:'0-2',currentDataFormProp:DataFormProp.Y_ANCHOR_POSITION});
  const values=Array.from({length:20},(_,i)=>i*4);await applyDataChanges('mark',[values] as any);aligned(state().disk);
  expect(centers(state().disk,'0-1').map((p:number[])=>p[1])).toEqual(values);
 });
 it('does not replace the current state if saving a new sample fails',async()=>{
  await setupEditor();const current=useChartStore.getState().dsl_json;
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:500,json:async()=>({error:'save failed'})})));
  await expect(changeDataMode('generated')).rejects.toThrow();expect(useChartStore.getState().dsl_json).toBe(current);
 });
});
