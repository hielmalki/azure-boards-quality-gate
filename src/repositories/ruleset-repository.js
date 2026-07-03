import { getValue, setValue } from './table-kv-store.js';
import { ACTIVE_RULESETS_KEY, CUSTOM_RULESETS_KEY } from './storage-keys.js';

export async function getStoredActiveRulesets(deps = {}) {
  return (await getValue(ACTIVE_RULESETS_KEY, deps)) ?? null;
}

export async function setStoredActiveRulesets(activeRulesetIds, deps = {}) {
  await setValue(ACTIVE_RULESETS_KEY, activeRulesetIds, deps);
}

export async function getStoredCustomRulesets(deps = {}) {
  return (await getValue(CUSTOM_RULESETS_KEY, deps)) ?? null;
}

export async function setStoredCustomRulesets(customRulesets, deps = {}) {
  await setValue(CUSTOM_RULESETS_KEY, customRulesets, deps);
}
