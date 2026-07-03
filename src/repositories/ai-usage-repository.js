import { getValue, setValue } from './table-kv-store.js';
import { getAiUsageKey } from './storage-keys.js';

export async function getStoredAiUsage(accountId, deps = {}) {
  return (await getValue(getAiUsageKey(accountId), deps)) ?? null;
}

export async function setStoredAiUsage(accountId, record, deps = {}) {
  await setValue(getAiUsageKey(accountId), record, deps);
}
