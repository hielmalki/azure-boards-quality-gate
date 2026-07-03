import { kvs } from '@forge/kvs';
import { getUserStateKey } from './storage-keys.js';

export async function getStoredUserState(accountId) {
  return (await kvs.get(getUserStateKey(accountId))) ?? null;
}

export async function setStoredUserState(accountId, userState) {
  await kvs.set(getUserStateKey(accountId), userState);
}
