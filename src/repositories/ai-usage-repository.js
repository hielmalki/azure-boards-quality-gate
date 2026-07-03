import { kvs } from '@forge/kvs';
import { getAiUsageKey } from './storage-keys.js';

export async function getStoredAiUsage(accountId) {
  return (await kvs.get(getAiUsageKey(accountId))) ?? null;
}

export async function setStoredAiUsage(accountId, record) {
  await kvs.set(getAiUsageKey(accountId), record);
}
