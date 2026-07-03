import { kvs } from '@forge/kvs';
import { ACTIVE_RULESETS_KEY, CUSTOM_RULESETS_KEY } from './storage-keys.js';

export async function getStoredActiveRulesets() {
  return (await kvs.get(ACTIVE_RULESETS_KEY)) ?? null;
}

export async function setStoredActiveRulesets(activeRulesetIds) {
  await kvs.set(ACTIVE_RULESETS_KEY, activeRulesetIds);
}

export async function getStoredCustomRulesets() {
  return (await kvs.get(CUSTOM_RULESETS_KEY)) ?? null;
}

export async function setStoredCustomRulesets(customRulesets) {
  await kvs.set(CUSTOM_RULESETS_KEY, customRulesets);
}
