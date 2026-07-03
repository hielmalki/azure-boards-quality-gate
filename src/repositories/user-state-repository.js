import { getValue, setValue } from './table-kv-store.js';
import { getUserStateKey } from './storage-keys.js';

export async function getStoredUserState(accountId, deps = {}) {
  return (await getValue(getUserStateKey(accountId), deps)) ?? null;
}

export async function setStoredUserState(accountId, userState, deps = {}) {
  await setValue(getUserStateKey(accountId), userState, deps);
}
