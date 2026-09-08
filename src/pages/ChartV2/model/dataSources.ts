import { createSeededRandom } from './seededRandom';

export type DataMode = 'reference' | 'generated';
export type SourceGenerator =
  | {type:'uniform'; min:number; max:number}
  | {type:'sequence'; start:number; step:number}
  | {type:'jitter'; amount:number};
export interface SourceField { values?:number[]; generator?:SourceGenerator }
export interface DataSource { count:number; fields:Record<string,SourceField> }
export interface DataRef { source:string; x?:string; y?:string; angle?:string; radius?:string; x_size?:string; y_size?:string; angle_size?:string; radius_size?:string }
export type ResolvedSources = Record<string,Record<string,number[]>>;
const axes = ['x','y','angle','radius'] as const;
const bindings = [...axes, 'x_size','y_size','angle_size','radius_size'] as const;
const own = (o:object,k:string) => Object.prototype.hasOwnProperty.call(o,k);
const record = (v:unknown):v is Record<string,any> => v!==null && typeof v==='object' && !Array.isArray(v);
const finite = (v:unknown):v is number => typeof v==='number' && Number.isFinite(v);

export function validateSharedData(document:Record<string,unknown>):void {
  if (document.data_mode!==undefined && document.data_mode!=='reference' && document.data_mode!=='generated') throw Error('data_mode must be reference or generated.');
  const sources = document.data_sources ?? {};
  if (!record(sources)) throw Error('data_sources must be an object.');
  for (const [name,source] of Object.entries(sources)) {
    if (!record(source) || !Number.isSafeInteger(source.count) || source.count<1 || source.count>100000 || !record(source.fields) || !Object.keys(source.fields).length) throw Error(`Invalid data source ${name}.`);
    for (const [field,config] of Object.entries(source.fields)) {
      if (!record(config)) throw Error(`Invalid source field ${name}.${field}.`);
      const values=config.values, g=config.generator;
      if (values!==undefined && (!Array.isArray(values) || values.length!==source.count || !values.every(finite))) throw Error(`${name}.${field}: values must match the source count and be finite.`);
      if (values===undefined && g===undefined) throw Error(`${name}.${field}: provide values or a generator.`);
      if (g!==undefined && (!record(g)
        || !(g.type==='uniform' && finite(g.min) && finite(g.max) && g.min<=g.max
          || g.type==='sequence' && finite(g.start) && finite(g.step)
          || g.type==='jitter' && finite(g.amount) && g.amount>=0 && values!==undefined))) throw Error(`${name}.${field}: invalid generator.`);
    }
  }
  for (const group of ['data_specification','template_data_specification']) {
    const specs=document[group];if (!record(specs)) continue;
    for (const [id,spec] of Object.entries(specs)) {
      if (!record(spec) || spec.data_ref===undefined) continue;
      const ref=spec.data_ref;
      if (!record(ref) || typeof ref.source!=='string' || !own(sources,ref.source)) throw Error(`${id}: unknown data_ref source.`);
      const source=sources[ref.source];
      if (spec.data_structure?.data_type!=='1D_LIST' || spec.data_structure?.data_size?.primary?.number!==source.count) throw Error(`${id}: data_ref currently requires a 1D_LIST with the same source count.`);
      if (!bindings.some(axis=>own(ref,axis))) throw Error(`${id}: data_ref must bind at least one anchor or size.`);
      for (const key of Object.keys(ref)) if (key!=='source' && !bindings.includes(key as typeof bindings[number])) throw Error(`${id}: unsupported data_ref key ${key}.`);
      for (const binding of bindings) if (own(ref,binding)) {
        const isSize=binding.endsWith('_size');
        const axis=isSize?binding.slice(0,-5):binding;
        if (typeof ref[binding]!=='string' || !own(source.fields,ref[binding])) throw Error(`${id}: unknown shared field ${String(ref[binding])}.`);
        const layout=spec.layout_specification?.[axis];
        if (!layout || layout.stacking) throw Error(`${id}.${axis}: shared anchors require a non-stacked layout.`);
        const property=isSize?'data_values':'anchor_values';
        if (layout[property]!==undefined) throw Error(`${id}.${axis}: use data_ref or ${property}, not both.`);
        if(isSize && source.fields[ref[binding]].values?.some((n:number)=>n<0)) throw Error(`${id}.${binding}: shared sizes must be non-negative.`);
      }
    }
  }
}

/** Each field is sampled once per document seed and reused by all consumers. */
export function resolveSharedData(document:Record<string,unknown>):ResolvedSources {
  validateSharedData(document);
  const result:ResolvedSources=Object.create(null);
  const mode=document.data_mode??'reference';
  const seed=(document.metadata as {generation_seed?:string}|undefined)?.generation_seed??'shared-default-v1';
  for (const [name,source] of Object.entries((document.data_sources??{}) as Record<string,DataSource>)) {
    result[name]=Object.create(null);
    for (const [field,config] of Object.entries(source.fields)) {
      const random=createSeededRandom(`shared-data-v1:${seed}:${name}:${field}`);
      const g=config.generator;
      if (config.values && (mode==='reference' || !g)) result[name][field]=[...config.values];
      else if (g) result[name][field]=Array.from({length:source.count},(_,i)=>{
        if (g.type==='sequence') return g.start+g.step*i;
        if (g.type==='uniform') return random.float(g.min,g.max);
        return Math.max(0,Math.min(100,config.values![i]+random.float(-g.amount,g.amount)));
      });
      else throw Error(`${name}.${field}: no values or generator.`);
      if (!result[name][field].every(finite)) throw Error(`${name}.${field}: generated values must be finite.`);
    }
  }
  return result;
}

export function applySourceAnchors<T extends {data_ref?:DataRef;layout_specification:any}>(spec:T, data:ResolvedSources):T {
  if (!spec.data_ref) return spec;
  const layout={...spec.layout_specification};
  for (const binding of bindings) {
    const field=spec.data_ref[binding];
    if(!field)continue;
    const isSize=binding.endsWith('_size'),axis=isSize?binding.slice(0,-5):binding;
    const values=data[spec.data_ref.source][field];
    if(isSize && values.some(n=>n<0))throw Error(`${binding}: shared sizes must be non-negative.`);
    layout[axis]={...layout[axis],[isSize?'data_values':'anchor_values']:values};
  }
  return {...spec,layout_specification:layout};
}
