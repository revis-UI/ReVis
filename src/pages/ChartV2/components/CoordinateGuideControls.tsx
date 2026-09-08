import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/shallow';
import { changeCoordinateGuides, useChartStore } from '../model/editor';
import { defaultCoordinateGuide, type CoordinateGuide, type CoordinateGuides } from '../model/coordinateGuides';

export function CoordinateGuideControls() {
  const { chart, document, saving, editorSelection, file } = useChartStore(useShallow(s=>({chart:s.chart,document:s.dsl_json,saving:s.isSaving,editorSelection:s.selectedContainerId,file:s.dsl_file})));
  const followedSelection=useRef('');
  const [selected,setSelected]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const containers=Object.values(chart.dsl_container);
  const guides=(document?.coordinate_guides??{}) as CoordinateGuides;
  const container=containers.find(c=>c.container_id===selected)
    ??containers.find(c=>(guides[c.container_id]??defaultCoordinateGuide(c,chart.dsl_container)).visible)
    ??containers[0];
  const config=container?guides[container.container_id]??defaultCoordinateGuide(container,chart.dsl_container): {visible:false};
  const update=async(key:keyof CoordinateGuide,enabled:boolean)=>{
    if(!container)return;
    setError('');setBusy(true);
    const defaults=container.coordinate==='cartesian'?{x:true,y:true,grid:false}:{angle:true,radius:true,grid:false};
    try {await changeCoordinateGuides({...guides,[container.container_id]:{...defaults,...config,[key]:enabled}});}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const selectContainer=async(id:string)=>{
    const target=containers.find(c=>c.container_id===id);
    if(!target)return;
    setError('');setBusy(true);
    const latest=(useChartStore.getState().dsl_json?.coordinate_guides??{}) as CoordinateGuides;
    const root=containers[0];
    const next={...latest};
    // Replace the implicit outer frame, while retaining explicitly enabled axes.
    if(root && id!==root.container_id && !latest[root.container_id]) {
      next[root.container_id]={...defaultCoordinateGuide(root,chart.dsl_container),visible:false};
    }
    next[id]={...defaultCoordinateGuide(target,chart.dsl_container),...latest[id],visible:true};
    const keys=target.coordinate==='polar'?['radius','angle'] as const:['x','y'] as const;
    if(keys.every(k=>next[id][k]===false) && !next[id].grid)keys.forEach(k=>next[id][k]=true);
    try {await changeCoordinateGuides(next);setSelected(id);}
    catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  useEffect(()=>{
    const key=`${file}:${editorSelection??''}`;
    if(followedSelection.current===key)return;
    followedSelection.current=key;
    if(!editorSelection){setSelected('');return;}
    if(containers.some(c=>c.container_id===editorSelection))void selectContainer(editorSelection);
  },[file,editorSelection]);
  const axes=container?.coordinate==='polar'?['radius','angle','grid'] as const:['x','y','grid'] as const;
  return <details className="relative shrink-0 border-b px-4 py-2 text-sm">
    <summary className="cursor-pointer">Coordinate axes &amp; grid</summary>
    <div className="absolute left-2 right-2 top-full z-20 max-h-64 overflow-auto rounded-md border bg-white p-3 shadow-lg">
      <label className="block">Container
        <select aria-label="Coordinate guide container" className="my-2 w-full rounded border p-1" value={container?.container_id??''} onChange={e=>void selectContainer(e.target.value)} disabled={saving||busy}>
          {containers.map(c=><option key={c.container_id} value={c.container_id}>{c.container_id} · {c.coordinate}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-3">
        {(['visible',...axes] as const).map(key=><label key={key} className="flex items-center gap-1">
          <input type="checkbox" aria-label={key==='visible'?'Show coordinate system':key+' axis'} checked={config[key]??(key!=='visible'&&key!=='grid')} disabled={!container||saving||busy} onChange={e=>void update(key,e.target.checked)}/>
          {key==='visible'?'Show system':key==='grid'?'Grid':key.toUpperCase()+' axis'}
        </label>)}
      </div>
      <p className="mt-2 text-xs text-gray-500">Selecting a container shows its axes. Local range: 0–100; angles in degrees. Changes are saved with the DSL.</p>
      {error&&<p role="alert" className="text-red-700">{error}</p>}
    </div>
  </details>;
}
