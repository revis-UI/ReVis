import * as d3 from 'd3';
import type { VisualChartContainer } from '../type';

export interface CoordinateGuide { visible: boolean; x?: boolean; y?: boolean; radius?: boolean; angle?: boolean; grid?: boolean }
export type CoordinateGuides = Record<string, CoordinateGuide>;
// Default to the root's immediate children; a single-container chart uses root.
// Use the tree rather than ID prefixes so templates and custom IDs behave alike.
export function defaultCoordinateGuide(c: VisualChartContainer, containers: Record<string, VisualChartContainer>): CoordinateGuide {
  const root = Object.values(containers)[0];
  const children = root?.components?.filter(child => containers[child.container_id]) ?? [];
  const visible = children.length > 0
    ? children.some(child => child.container_id === c.container_id)
    : c.container_id === root?.container_id;
  return {visible, x: true, y: true, radius: true, angle: true, grid: false};
}
type Layer = d3.Selection<SVGGElement, unknown, null, undefined>;
const steps = [0, .25, .5, .75, 1];
const mix = (a:number,b:number,t:number) => a+(b-a)*t;
function line(g:Layer,x1:number,y1:number,x2:number,y2:number) {
  return g.append('line').attr('x1',x1).attr('y1',y1).attr('x2',x2).attr('y2',y2);
}
function label(g:Layer,x:number,y:number,text:string) {
  g.append('text').attr('x',x).attr('y',y).attr('fill','#475569').attr('stroke','none')
    .attr('font-size',16).attr('text-anchor','middle').text(text);
}
export function validateCoordinateGuides(value:unknown):void {
  if(value===undefined)return;
  if(!value || typeof value!=='object' || Array.isArray(value))throw Error('coordinate_guides must be an object.');
  for(const config of Object.values(value)) {
    if(!config || typeof config!=='object' || Array.isArray(config))throw Error('Each coordinate guide must be an object.');
    for(const [key,enabled] of Object.entries(config)) {
      if(!['visible','x','y','radius','angle','grid'].includes(key)||typeof enabled!=='boolean')throw Error('Invalid coordinate guide visibility setting.');
    }
  }
}

/** Container-local 0–100 axes; geometry matches the renderer's global mapping. */
export function drawCartesianAxes(g:Layer,c:VisualChartContainer,settings:CoordinateGuide,width:number,height:number) {
  const s=c.coordinate_system;
  const x1=Number(s.x1)*width/100,x2=Number(s.x2)*width/100;
  const y1=height-Number(s.y1)*height/100,y2=height-Number(s.y2)*height/100;
  if(settings.grid) {
    const grid=g.append('g').attr('data-axis','grid').attr('stroke','#cbd5e1').attr('stroke-dasharray','4 4');
    steps.forEach(t=>{line(grid,mix(x1,x2,t),y1,mix(x1,x2,t),y2);line(grid,x1,mix(y1,y2,t),x2,mix(y1,y2,t));});
  }
  if(settings.x) {
    const axis=g.append('g').attr('data-axis','x');line(axis,x1,y1,x2,y1);
    steps.forEach(t=>{const x=mix(x1,x2,t);line(axis,x,y1,x,y1-7);label(axis,x,y1-12,String(t*100));});
  }
  if(settings.y) {
    const axis=g.append('g').attr('data-axis','y');line(axis,x1,y1,x1,y2);
    steps.forEach(t=>{const y=mix(y1,y2,t);line(axis,x1,y,x1+7,y);label(axis,x1+23,y+5,String(t*100));});
  }
}

/** Angle in degrees, radius in container-local 0–100 units. */
export function drawPolarAxes(g:Layer,c:VisualChartContainer,settings:CoordinateGuide,width:number,height:number) {
  const s=c.coordinate_system,outer=Math.min(width,height)/2;
  const cx=c.parent_coordinate==='cartesian' && s.cx!=null ? s.cx*width/100 : width/2;
  const cy=c.parent_coordinate==='cartesian' && s.cy!=null ? height-s.cy*height/100 : height/2;
  const a1=Number(s.a1)*Math.PI/180,a2=Number(s.a2)*Math.PI/180,r1=Number(s.r1)*outer,r2=Number(s.r2)*outer;
  const point=(a:number,r:number)=>[cx+Math.sin(a)*r,cy-Math.cos(a)*r] as const;
  const arc=(layer:Layer,r:number)=>{
    const points=Array.from({length:97},(_,i)=>point(mix(a1,a2,i/96),r));
    layer.append('path').attr('d',d3.line<readonly [number,number]>()(points));
  };
  const divisions=c.__data_specification?.data_structure?.data_size;
  const candidates=[divisions?.primary,divisions?.secondary];
  const count=Number(candidates.find(d=>d?.dimension==='angle')?.number);
  const n=Number.isInteger(count)&&count>=3&&count<=36?count:8;
  const full=Math.abs(Math.abs(a2-a1)-Math.PI*2)<1e-6;
  const angles=Array.from({length:full?n:n+1},(_,i)=>mix(a1,a2,i/n));
  if(settings.grid) {
    const grid=g.append('g').attr('data-axis','grid').attr('stroke','#cbd5e1').attr('stroke-dasharray','4 4');
    steps.slice(1).forEach(t=>arc(grid,mix(r1,r2,t)));
    angles.forEach(a=>{const p=point(a,r1),q=point(a,r2);line(grid,...p,...q);});
  }
  if(settings.angle) {
    const axis=g.append('g').attr('data-axis','angle');arc(axis,r2);
    angles.forEach(a=>{const p=point(a,r2),q=point(a,Math.max(r1,r2-8)),l=point(a,Math.max(r1,r2-22));line(axis,...p,...q);label(axis,...l,Math.round(a*180/Math.PI)+'°');});
  }
  if(settings.radius) {
    const axis=g.append('g').attr('data-axis','radius'),p=point(a1,r1),q=point(a1,r2);line(axis,...p,...q);
    steps.forEach(t=>{const p=point(a1,mix(r1,r2,t));line(axis,p[0]-5,p[1],p[0]+5,p[1]);label(axis,Math.max(20,Math.min(width-20,p[0]+22)),Math.max(18,Math.min(height-8,p[1]+5)),String(t*100));});
  }
}
export function drawCoordinateGuides(svg:SVGSVGElement,containers:Record<string,VisualChartContainer>,settings:CoordinateGuides={},width=1000,height=1000) {
  d3.select(svg).selectAll('.coordinate-guides').remove();
  const layer=d3.select(svg).append('g').attr('class','coordinate-guides').attr('fill','none')
    .attr('stroke','#64748b').attr('stroke-width',1.5).attr('pointer-events','none');
  for(const [id,c] of Object.entries(containers)) {
    const config=settings[id] ?? defaultCoordinateGuide(c,containers);
    if(!config.visible)continue;
    const g=layer.append('g').attr('data-guide-container',id);
    if(c.coordinate==='cartesian')drawCartesianAxes(g,c,config,width,height);
    else drawPolarAxes(g,c,config,width,height);
  }
}
