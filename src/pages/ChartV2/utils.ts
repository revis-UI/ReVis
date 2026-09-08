import { previewDocument } from './model/previewDocument';
import { loadDSLFile } from '@/services/dsl';
import type { JSON_FILES } from "@/generated/json-files";
import * as R from "ramda";

export type DSLCategory = 'basic_charts' | 'composite';

const dataModules = import.meta.glob<{default: unknown}>('../../datav3/*/*.json');
const imageModules = import.meta.glob('../../imagev3/*/*.{png,jpg}', {eager:true, query:'?url', import:'default'}) as Record<string,string>;

export const resolveDataCategory = async (baseFileName: string | typeof JSON_FILES[number]): Promise<DSLCategory | null> => {
  for (const category of ['basic_charts','composite'] as const) {
    if (`../../datav3/${category}/${baseFileName}.json` in dataModules) return category;
  }
  return null;
};

export const loadData = async (baseFileName: string | typeof JSON_FILES[number], _legacyType?: 'editor' | 'gallery') => {
  const category = await resolveDataCategory(baseFileName);
  if (!category) return null;
  let data: unknown;
  try { data = (await loadDSLFile(category, `${baseFileName}.json`)).content; }
  catch { data = (await dataModules[`../../datav3/${category}/${baseFileName}.json`]()).default; }
  return _legacyType === 'gallery' ? previewDocument(data) : data;
};

export async function getImagePath(chartFile: string | typeof JSON_FILES[number]): Promise<string> {
  for (const category of ['basic_charts','composite']) for (const extension of ['png','jpg']) {
    const url=imageModules[`../../imagev3/${category}/${chartFile}.${extension}`];
    if(url) return url;
  }
  throw new Error(`Failed to load image file: ${chartFile}`);
}

export const selectRandomElements = R.curry((count, array) => {
  const safeCount = Math.min(count, array.length);
  
  return R.pipe(
    R.sort(() => Math.random() - 0.5),
    R.take(safeCount)
  )(array);
});

export function polarToCartesian(centerX: number, centerY: number, angle: number, radius: number) {
  return {
    x: centerX + (radius * Math.sin(angle)),
    y: centerY - (radius * Math.cos(angle))
  };
}
