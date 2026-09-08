import {useState} from 'react';
import {Button} from '@/components/ui/button';
import type {DataMode} from '../model/dataSources';

export function DataModeControls({mode,onChange,disabled=false}:{mode:DataMode;onChange:(mode:DataMode)=>void|Promise<void>;disabled?:boolean}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const change=async(next:DataMode)=>{setBusy(true);setError('');try{await onChange(next)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}};
  return <div className="flex flex-wrap items-center gap-2 text-sm">
    <span>Data: {mode==='reference'?'Reference':'Generated'}</span>
    <Button variant="outline" size="sm" disabled={disabled||busy||mode==='reference'} onClick={()=>change('reference')}>Restore reference</Button>
    <Button variant="outline" size="sm" disabled={disabled||busy} onClick={()=>change('generated')}>{busy?'Updating…':mode==='generated'?'New sample':'Generate sample'}</Button>
    {error&&<p role="alert" className="w-full text-red-700">{error}</p>}
  </div>;
}
