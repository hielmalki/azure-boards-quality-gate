import { kvs } from '@forge/kvs';
import { APP_CONFIG_OPENAI_KEY } from './storage-keys.js';

export async function getStoredOpenAiApiKey() {
  return (await kvs.get(APP_CONFIG_OPENAI_KEY)) ?? null;
}

export async function setStoredOpenAiApiKey(apiKey) {
  if (typeof apiKey === 'string' && apiKey.trim().length > 0) {
    await kvs.set(APP_CONFIG_OPENAI_KEY, apiKey.trim());
  } else {
    await kvs.delete(APP_CONFIG_OPENAI_KEY);
  }
}
