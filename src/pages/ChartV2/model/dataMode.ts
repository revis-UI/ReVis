import { VisualChart } from './Chart';
import { migrateDocument, type ChartDocument, type PersistedViewData } from './document';
import { createGenerationSeed, createSeededRandom } from './seededRandom';
import type { DataMode } from './dataSources';

interface ReferenceState { dsl:Record<string,unknown>; seed:string; view:PersistedViewData }
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const definition=(doc:ChartDocument) => {
  const result:Record<string,unknown>=clone(doc);
  for(const key of ['metadata','history','view_data','data_mode','reference_state'])delete result[key];
  return result;
};
function sample(doc:ChartDocument):PersistedViewData {
  const chart=new VisualChart();chart.setRandomGenerator(createSeededRandom(doc.metadata.generation_seed).next);
  chart.parseDSL(doc);return chart.createViewSnapshot() as unknown as PersistedViewData;
}

/** Build a candidate; callers keep their existing save/history transaction flow. */
export function buildDataModeCandidate(input:unknown, mode:DataMode, seed=createGenerationSeed()):ChartDocument {
  const current=migrateDocument(input);
  const next=clone(current);
  const previous=(current.data_mode??'reference') as DataMode;
  if(mode==='generated') {
    if(previous==='reference') {
      const view=Object.keys(current.view_data.marks).length ? current.view_data : sample(current);
      next.reference_state={dsl:definition(current),seed:current.metadata.generation_seed,view:clone(view)} satisfies ReferenceState;
    }
    next.data_mode='generated';next.metadata.generation_seed=seed;
    next.view_data=sample(next);
  } else {
    const saved=current.reference_state as ReferenceState|undefined;
    next.data_mode='reference';
    if(saved) {
      next.metadata.generation_seed=saved.seed;
      next.view_data=JSON.stringify(saved.dsl)===JSON.stringify(definition(current)) ? clone(saved.view) : sample(next);
    } else next.view_data=Object.keys(current.view_data.marks).length ? clone(current.view_data) : sample(next);
    delete next.reference_state;
  }
  return next;
}
