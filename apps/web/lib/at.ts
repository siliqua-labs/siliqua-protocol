// Indexed read that fails loudly. tsconfig has noUncheckedIndexedAccess, and an
// out-of-range index here is a bug, not a case to default away.
export function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`index ${index} out of range (length ${items.length})`);
  }
  return item;
}
