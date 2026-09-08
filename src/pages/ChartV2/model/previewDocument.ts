/** Preview sessions do not need the author's persisted undo log. The source
 * document is untouched; saving merges the edit with its latest full history. */
export function previewDocument<T>(input: T): T {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  return {...input, history:{cursor:0, entries:[]}};
}
