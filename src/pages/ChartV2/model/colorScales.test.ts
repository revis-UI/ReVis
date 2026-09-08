import {readFileSync} from 'node:fs';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {VisualChart} from './Chart';
import {resolveScopedColor,validateColorScales} from './colorScales';
import {buildDataModeCandidate} from './dataMode';
import {validateDocument,migrateDocument} from './document';
import {changeDslFile,changeDslJson,useChartStore} from './editor';
const read=(name:string):any=>JSON.parse(readFileSync(`src/datav3/composite/${name}.json`,'utf8'));
const colors=(marks:any)=>marks.flat().map((p:any)=>p.props.fill);
function panels(doc:any,template:string){
 return Object.entries(doc.view_data.marks).filter(([id])=>doc.view_data.containers[id]?.template_id===template).map(([,m])=>colors(m));
}
afterEach(()=>vi.unstubAllGlobals());
describe('scoped colors and shared palettes',()=>{
 for(const [name,template,n] of [['05_box_plot','0-a-1',3],['17_multiple_areas','0-a-0',4]] as const){
  it(`keeps ${name} uniform within each panel and distinct between panels`,()=>{
   const ref=read(name);
   for(const doc of [ref,...['a','b','c'].map(seed=>buildDataModeCandidate(ref,'generated',seed))]){
    const groups=panels(doc,template);expect(groups).toHaveLength(n);
    groups.forEach(g=>expect(new Set(g).size).toBe(1));expect(new Set(groups.flat()).size).toBe(n);
    const chart=new VisualChart();chart.parseDSL(doc);chart.restoreViewSnapshot(doc.view_data);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');chart.initSVGDOM(svg);chart.drawData();
    expect(svg.outerHTML).not.toMatch(/NaN|Infinity/);
    expect(chart.createViewSnapshot()).toEqual(doc.view_data);
   }
  });
 }
 it('matches each LineUp histogram palette index to every stacked row through sampling/restoration',()=>{
  const ref=read('18_line_up');
  for(const seed of ['x','y','z']){
   const generated=buildDataModeCandidate(ref,'generated',seed);
   for(const doc of [generated,buildDataModeCandidate(generated,'reference')]){
    const top=panels(doc,'0-0-a');expect(top).toHaveLength(3);
    top.forEach((g,i)=>{expect(new Set(g).size).toBe(1);(doc.view_data.marks['0-1'] as any[]).forEach((row:any)=>expect(row[i].props.fill).toBe(g[0]));});
   }
   expect(buildDataModeCandidate(generated,'reference').view_data).toEqual(ref.view_data);
  }
 });
 it('draws one random color per instance without perturbing numerical data',()=>{
  const ref=read('05_box_plot'),random=structuredClone(ref);
  random.data_specification['0-a-1'].non_layout_specification.fill.scale='categorical_instance';
  const draws=[];
  for(const seed of ['a','b','c','d']){
   const fixed=buildDataModeCandidate(ref,'generated',seed),doc=buildDataModeCandidate(random,'generated',seed);
   const groups=panels(doc,'0-a-1');groups.forEach(g=>expect(new Set(g).size).toBe(1));draws.push(groups.map(g=>g[0]).join(','));
   for(const [id,marks] of Object.entries(doc.view_data.marks) as any){
    marks.flat().forEach((p:any,i:number)=>{const {props:_,...geometry}=p;const {props:__,...original}=(fixed.view_data.marks[id] as any[]).flat()[i];expect(geometry).toEqual(original);});
   }
   expect(buildDataModeCandidate(random,'generated',seed).view_data).toEqual(doc.view_data);
  }
  expect(new Set(draws).size).toBeGreaterThan(1);
 });
 it('shares random instance draws by ref, and cycles ordinal palettes explicitly',()=>{
  const scales={p:['red','blue']};
  const rule={scale:'categorical_instance' as const,ref:'p'};
  expect(resolveScopedColor(rule,scales,'seed','a','fill',1,0,0)).toBe(resolveScopedColor(rule,scales,'seed','b','stroke',1,4,8));
  expect(resolveScopedColor({scale:'ordinal_instance',ref:'p'},scales,'seed','a','fill',2,0,0)).toBe('red');
 });
 it('inherits the nearest template instance for descendant marks',()=>{
  const raw=read('05_box_plot');
  // Wrap marks one level deeper; the color scope must still come from their template ancestor.
  const template=raw.components[0];const children=template.components;
  for(const child of children){const old=child.container_id;child.container_id=old.replace('0-a-','0-a-wrap-');raw.data_specification[child.container_id]=raw.data_specification[old];delete raw.data_specification[old];}
  template.components=[{container_id:'0-a-wrap',coordinate:'cartesian',coordinate_system:children[0].coordinate_system,if_leaf:false,components:children}];
  const doc=buildDataModeCandidate(raw,'generated','nested');
  expect(new Set(panels(doc,'0-a-wrap-1').flat()).size).toBe(3);
 });
 it('rejects broken/ambiguous palette references before rendering',()=>{
  for(const rule of [{scale:'ordinal_instance',ref:'missing'},{scale:'ordinal_instance',options:[]},{scale:'fix',ref:'p'},{scale:'ordinal_instance',ref:'p',options:['red']}]){
   const raw=read('05_box_plot');raw.color_scales={p:['red']};raw.data_specification['0-a-1'].non_layout_specification.fill=rule;
   expect(validateDocument(raw).valid).toBe(false);expect(()=>new VisualChart().parseDSL(raw)).toThrow();
  }
  expect(()=>validateColorScales({color_scales:{p:[]}})).toThrow();
 });
 it('Apply Changes to a shared palette updates all consumers and saves the mapping',async()=>{
  let saved=read('18_line_up');
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
   if(init?.method==='PUT'){saved=JSON.parse(init.body as string).content;return {ok:true,json:async()=>({success:true,content:saved,fileHash:'colors-next'})};}
   return {ok:true,json:async()=>({success:true,content:saved,fileHash:'colors-initial'})};
  }));
  useChartStore.setState({dsl_json:null,chart:new VisualChart(),sourceHash:null,aiPatchPreviews:{}} as any);
  await changeDslFile('18_line_up');
  const next=structuredClone(useChartStore.getState().dsl_json) as any;
  next.color_scales.metrics[0]='#663399';
  await changeDslJson(next);
  const doc=useChartStore.getState().dsl_json as any;
  expect(doc.color_scales.metrics[0]).toBe('#663399');
  expect(panels(doc,'0-0-a')[0].every((c:string)=>c==='#663399')).toBe(true);
  (doc.view_data.marks['0-1'] as any[]).forEach((row:any)=>expect(row[0].props.fill).toBe('#663399'));
  expect(migrateDocument(saved).color_scales).toEqual(doc.color_scales);
 });
});
