import type { JSON_FILES } from "@/generated/json-files";
import * as R from "ramda";

export const randomInRange = (min: number, max: number) => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

export const loadData = async (baseFileName: string | typeof JSON_FILES[number], type: 'editor' | 'gallery' = 'editor') => {
  const key = String(baseFileName);

  try {
    const mod0 = await import(`../../${type === 'gallery' ? 'datav3' : 'data_editor'}/basic_charts/${key}.json`);
    return mod0.default;
  } catch (e) {}

  try {
    const mod0 = await import(`../../${type === 'gallery' ? 'datav3' : 'data_editor'}/composite/${key}.json`);
    return mod0.default;
  } catch (e) {}

  console.error(`Failed to load data file: ${key}`);
  return null;
};

export async function getImagePath(chartFile: string | typeof JSON_FILES[number], type: 'editor' | 'gallery' = 'editor'): Promise<string> {
  const key = String(chartFile);

  try {
    await import(`../../imagev3/basic_charts/${key}.png`);
    return `/ReVis/src/imagev3/basic_charts/${key}.png`;
  } catch (e) {}

  try {
    await import(`../../imagev3/basic_charts/${key}.jpg`);
    return `/ReVis/src/imagev3/basic_charts/${key}.jpg`;
  } catch (e) {}

  try {
    await import(`../../imagev3/composite/${key}.png`);
    return `/ReVis/src/imagev3/composite/${key}.png`;
  } catch (e) {}

  try {
    await import(`../../imagev3/composite/${key}.jpg`);
    return `/ReVis/src/imagev3/composite/${key}.jpg`;
  } catch (e) {}

  try {
    await import(`../../imagev3/composite/${key}.jpg`);
    return `/ReVis/src/imagev3/composite/${key}.jpg`;
  } catch (e) {}
  throw new Error(`Failed to load image file: ${key}`);
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