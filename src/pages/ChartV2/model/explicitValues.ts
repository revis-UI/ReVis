/** Explicit values use the renderer's local 0–100 units (also for polar axes).
 * Matrices are [primary][secondary]; no broadcasting or silent truncation.
 * Persisted view caches remain authoritative after a user edits the data.
 */
export type ExplicitValues = number[] | number[][];

export function validateExplicitValues(
  values: ExplicitValues | undefined,
  rows: number,
  columns: number | number[] | undefined,
  label: string,
  nonNegative = false,
): void {
  if (values === undefined) return;
  const validNumber = (v: unknown) => typeof v === 'number'
    && Number.isFinite(v) && (!nonNegative || v >= 0);
  const valid = Array.isArray(values) && values.length === rows && values.every((v, i) =>
    columns === undefined ? validNumber(v)
      : Array.isArray(v) && v.length === (Array.isArray(columns) ? columns[i] : columns)
        && v.every(validNumber));
  if (!valid) throw new Error(`${label} must contain finite ${nonNegative ? 'non-negative ' : ''}values matching the data structure (${rows} primary entries).`);
}

export function explicitValue(values: ExplicitValues | undefined, i: number, j?: number): number | undefined {
  if (values === undefined) return undefined;
  return j === undefined ? values[i] as number : (values[i] as number[])[j];
}
