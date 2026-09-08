import { createSeededRandom } from './seededRandom';

export interface GaussianMixture {
  type: 'gaussian_mixture';
  seed: number | string;
  background_weight: number;
  outliers?: [number,number][];
  clusters: {
    weight: number;
    center: [number, number];
    spread: [number, number];
    correlation: number;
  }[];
}

/** Deterministic local-coordinate sampler; not a recovery of the original observations. */
export function generatePositions(config: GaussianMixture, count: number): [number, number][] {
  const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const pair = (v: unknown): v is [number, number] => Array.isArray(v)
    && v.length === 2 && v.every(finite);
  if (!config || config.type !== 'gaussian_mixture'
    || !(typeof config.seed === 'string' || finite(config.seed))
    || !finite(config.background_weight) || config.background_weight < 0
    || !Array.isArray(config.clusters) || !config.clusters.length
    || !Number.isSafeInteger(count) || count < 0
    || !config.clusters.every(c => c && finite(c.weight) && c.weight >= 0
      && pair(c.center) && c.center.every(v => v >= 0 && v <= 100)
      && pair(c.spread) && c.spread.every(v => v >= 0)
      && finite(c.correlation) && Math.abs(c.correlation) <= 1)) {
    throw new Error('Invalid gaussian_mixture position generator.');
  }
  if (config.outliers !== undefined && (!Array.isArray(config.outliers)
    || config.outliers.length > count || !config.outliers.every(p => pair(p) && p.every(v => v >= 0 && v <= 100)))) {
    throw new Error('Outliers must be finite coordinate pairs inside [0,100] and fit the requested count.');
  }
  const total = config.background_weight + config.clusters.reduce((sum,c) => sum+c.weight,0);
  if (!Number.isFinite(total) || total <= 0) throw new Error('Position generator weights must have a positive finite sum.');
  const random = createSeededRandom(`gaussian-mixture-v1:${config.seed}`);
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const positions: [number,number][] = Array.from({length:count-(config.outliers?.length??0)}, () => {
    let choice = random.next()*total;
    if (choice < config.background_weight) return [random.float(0,100), random.float(0,100)];
    choice -= config.background_weight;
    const cluster = config.clusters.find(c => (choice -= c.weight) < 0) || config.clusters.at(-1)!;
    const radius = Math.sqrt(-2*Math.log(Math.max(random.next(), Number.EPSILON)));
    const angle = 2*Math.PI*random.next();
    const x = radius*Math.cos(angle), y = radius*Math.sin(angle);
    return [clamp(cluster.center[0]+cluster.spread[0]*x),
      clamp(cluster.center[1]+cluster.spread[1]*(cluster.correlation*x+Math.sqrt(1-cluster.correlation**2)*y))];
  });
  return positions.concat((config.outliers??[]).map(p => [...p] as [number,number]));
}
