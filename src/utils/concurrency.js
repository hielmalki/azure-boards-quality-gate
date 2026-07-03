/**
 * Maps over `items` with a bounded number of concurrent `mapper` calls,
 * preserving input order in the returned results array. A fixed pool of
 * workers pulls the next index until the list is exhausted.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} concurrencyLimit  - Maximum in-flight mapper calls (>= 1).
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @returns {Promise<R[]>}
 */
export async function mapWithConcurrency(items, concurrencyLimit, mapper) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const limit = Math.max(1, Math.floor(concurrencyLimit));
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
