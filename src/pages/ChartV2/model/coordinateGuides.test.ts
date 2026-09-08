import {describe,it,expect} from 'vitest';
import {drawCoordinateGuides,validateCoordinateGuides} from './coordinateGuides';
import {generateAreaChart,generateGroup} from '@/utils/link';
import type {VisualChartContainer} from '../type';
const svg=()=>document.createElementNS('http://www.w3.org/2000/svg','svg');
describe('coordinate guides',()=>{
 it('shows the main axes by default and respects saved hiding',()=>{
  const node=svg();
  const c={container_id:'0',coordinate:'cartesian',coordinate_system:{x1:0,x2:100,y1:0,y2:100}} as VisualChartContainer;
  const containers={'0':c,'0-1':{...c,container_id:'0-1'}};
  drawCoordinateGuides(node,containers);
  expect(node.querySelectorAll('[data-guide-container]')).toHaveLength(1);
  expect(node.querySelector('[data-axis="x"]')).not.toBeNull();
  expect(node.querySelector('[data-axis="y"]')).not.toBeNull();
  drawCoordinateGuides(node,containers,{'0':{visible:false}});
  expect(node.querySelector('[data-guide-container]')).toBeNull();
 });

 it('defaults to immediate children, excluding root and deeper descendants',()=>{
  const node=svg();
  const bounds={x1:10,x2:90,y1:10,y2:90};
  const grandchild={container_id:'arbitrary-deep-id',coordinate:'cartesian',coordinate_system:bounds} as VisualChartContainer;
  const child={container_id:'panel',coordinate:'cartesian',coordinate_system:bounds,components:[grandchild]} as VisualChartContainer;
  const template={...child,container_id:'0-a',components:[]} as VisualChartContainer;
  const root={...child,container_id:'root',components:[child,template]} as VisualChartContainer;
  const containers={root,panel:child,'0-a':template,'arbitrary-deep-id':grandchild};
  drawCoordinateGuides(node,containers);
  const ids=()=>Array.from(node.querySelectorAll('[data-guide-container]')).map(n=>n.getAttribute('data-guide-container'));
  expect(ids()).toEqual(['panel','0-a']);
  drawCoordinateGuides(node,containers,{panel:{visible:false},root:{visible:true,x:true}});
  expect(ids()).toEqual(['root','0-a']);
 });

 it('maps nested Cartesian bounds and independently toggles axes',()=>{
  const node=svg();
  const containers={a:{container_id:'a',coordinate:'cartesian',coordinate_system:{x1:20,x2:80,y1:30,y2:90}} as VisualChartContainer};
  drawCoordinateGuides(node,containers,{a:{visible:true,x:true,y:false}});
  const line=node.querySelector('[data-axis="x"] line')!;
  expect([line.getAttribute('x1'),line.getAttribute('x2'),line.getAttribute('y1')]).toEqual(['200','800','700']);
  expect(node.querySelector('[data-axis="y"]')).toBeNull();
  drawCoordinateGuides(node,containers,{a:{visible:true,y:true,grid:true}});
  expect(node.querySelector('[data-axis="x"]')).toBeNull();
  expect(node.querySelectorAll('.coordinate-guides')).toHaveLength(1);
  expect(node.querySelector('[data-axis="grid"]')).not.toBeNull();
  drawCoordinateGuides(node,containers,{a:{visible:false,x:true}});
  expect(node.querySelectorAll('[data-guide-container]')).toHaveLength(0);
 });
 it('uses translated polar centers and partial angular extents',()=>{
  const node=svg();
  const containers={p:{container_id:'p',coordinate:'polar',parent_coordinate:'cartesian',coordinate_system:{cx:25,cy:75,a1:90,a2:180,r1:0,r2:.5}} as VisualChartContainer};
  drawCoordinateGuides(node,containers,{p:{visible:true,radius:true,angle:true,grid:true}});
  const line=node.querySelector('[data-axis="radius"] line')!;
  expect(Number(line.getAttribute('x1'))).toBe(250);
  expect(Number(line.getAttribute('y1'))).toBe(250);
  expect(Number(line.getAttribute('x2'))).toBe(500);
  expect(Number(line.getAttribute('y2'))).toBeCloseTo(250);
  expect(node.outerHTML).not.toMatch(/NaN|Infinity/);
 });
 it('rejects malformed visibility settings',()=>{
  expect(()=>validateCoordinateGuides({a:{x:'yes'}})).toThrow();
  expect(()=>validateCoordinateGuides({a:{unknown:true}})).toThrow();
 });
});
describe('polar area boundary regression',()=>{
 it('closes a radar series once without an inner contour, screen-top baseline, or mutation',()=>{
  const data=[
   {x:{d1:500,d2:500},y:{d1:450,d2:200}},
   {x:{d1:550,d2:800},y:{d1:550,d2:800}},
   {x:{d1:450,d2:200},y:{d1:550,d2:800}}
  ];
  const before=JSON.stringify(data);
  const path=generateAreaChart(data,{},'polar')!.getAttribute('d')!;
  expect(path).not.toMatch(/,0(?:L|M|Z|$)/);
  expect(path).toContain('500,200');
  expect(path).not.toContain('500,450');
  expect(path).toBe('M500,200L800,800L200,800Z');
  expect(path.match(/Z/g)).toHaveLength(1);
  const band=generateGroup('band',data,{},'polar')!.getAttribute('d')!;
  expect(band).toContain('500,450');
  expect(band.match(/Z/g)).toHaveLength(2);
  expect(JSON.stringify(data)).toBe(before);
 });
 it('retains the Cartesian baseline',()=>{
  const path=generateAreaChart([{x:{d1:10,d2:20},y:{d1:0,d2:30}},{x:{d1:40,d2:50},y:{d1:0,d2:60}}],{},'cartesian')!.getAttribute('d');
  expect(path).toBe('M10,30L40,60L40,0L10,0Z');
 });
});
