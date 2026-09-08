export function validateLinkValues(value: unknown): asserts value is [string,string][] {
  if (!Array.isArray(value) || value.some(pair => !Array.isArray(pair) || pair.length !== 2
    || pair.some(id => typeof id !== 'string' || !/^(container_|id_).+/.test(id)))) {
    throw new Error('link_values must be an array of [source, target] endpoint pairs.');
  }
}
