import {createSeededRandom} from './seededRandom';

/** Shared ordered palettes. Indices express correspondence, not inferred data semantics. */
export type ColorScales = Record<string, string[]>;
export interface StyleRule {
  scale: 'fix' | 'linear' | 'ordinal_primary' | 'ordinal_secondary' | 'categorical'
    | 'ordinal_instance' | 'categorical_instance';
  fix?: number | string;
  linear?: [number, number];
  options?: string[] | null;
  ref?: string;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const palette = (v: unknown): v is string[] => Array.isArray(v) && v.length > 0 && v.every(c => typeof c === 'string' && c.trim().length > 0);
const paletteModes = ['ordinal_primary','ordinal_secondary','ordinal_instance','categorical','categorical_instance'];

export function validateColorScales(doc: Record<string, unknown>) {
  const scales = doc.color_scales;
  if (scales !== undefined && (!record(scales) || Object.values(scales).some(v => !palette(v)))) {
    throw new Error('color_scales must map names to non-empty arrays of color strings.');
  }
  for (const specs of [doc.data_specification, doc.template_data_specification]) {
    if (!record(specs)) continue;
    for (const [id, spec] of Object.entries(specs)) {
      if (!record(spec) || !record(spec.non_layout_specification)) continue;
      for (const [key, rule] of Object.entries(spec.non_layout_specification)) {
        if (!record(rule)) continue;
        if (rule.ref !== undefined) {
          if (!['fill','stroke'].includes(key) || !paletteModes.includes(String(rule.scale))) {
            throw new Error(`${id}.${key}: color references require a palette-based fill or stroke rule.`);
          }
          if (typeof rule.ref !== 'string' || !record(scales) || !Object.hasOwn(scales,rule.ref)) {
            throw new Error(`${id}.${key}: unknown color scale reference.`);
          }
          if (rule.options != null || rule.fix != null || rule.linear != null) {
            throw new Error(`${id}.${key}: ref cannot be combined with local options, fix, or linear.`);
          }
        }
        if (['ordinal_instance','categorical_instance'].includes(String(rule.scale)) && rule.ref === undefined && !palette(rule.options)) {
          throw new Error(`${id}.${key}: instance coloring requires a non-empty palette or ref.`);
        }
      }
    }
  }
}

/** Returns only the new scoped/reference modes; legacy rules retain their behavior. */
export function resolveScopedColor(rule: StyleRule, scales: ColorScales, seed: string,
  containerId: string, property: string, instance: number, primary: number, secondary: number): string | undefined {
  const options = rule.ref === undefined ? rule.options : scales[rule.ref];
  if (!options?.length) return undefined;
  if (rule.scale === 'ordinal_instance') return options[instance % options.length];
  if (rule.ref !== undefined && rule.scale === 'ordinal_primary') return options[primary % options.length];
  if (rule.ref !== undefined && rule.scale === 'ordinal_secondary') return options[secondary % options.length];
  if (rule.scale === 'categorical_instance') {
    // Shared references give matching instances the same draw across consumers/properties.
    const namespace = rule.ref === undefined ? [containerId,property] : [rule.ref];
    return createSeededRandom(JSON.stringify(['instance-color-v1',seed,namespace,instance])).pick(options);
  }
  return undefined;
}
