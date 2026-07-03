import { getValue, setValue, deleteValue } from './table-kv-store.js';
import { APP_CONFIG_OPENAI_KEY } from './storage-keys.js';

export async function getStoredOpenAiApiKey(deps = {}) {
  return (await getValue(APP_CONFIG_OPENAI_KEY, deps)) ?? null;
}

export async function setStoredOpenAiApiKey(apiKey, deps = {}) {
  if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
    await setValue(APP_CONFIG_OPENAI_KEY, apiKey.trim(), deps);
  } else {
    await deleteValue(APP_CONFIG_OPENAI_KEY, deps);
  }
}
