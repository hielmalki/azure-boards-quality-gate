import {
  getValue as getTableValue,
  setValue as setTableValue,
  deleteValue as deleteTableValue,
} from './table-kv-store.js';
import {
  getValue as getSecretValue,
  setValue as setSecretValue,
  deleteValue as deleteSecretValue,
} from './key-vault-store.js';
import { APP_CONFIG_OPENAI_KEY } from './storage-keys.js';

const DEFAULT_OPENAI_SECRET_NAME = 'openai-api-key';

// Ist AZURE_KEY_VAULT_URL gesetzt, ist Key Vault die Quelle der Wahrheit für den
// OpenAI-Key (Härtung aus Schritt 2 – der Key soll nicht als Klartext in Azure Table
// Storage liegen). Ohne Key Vault bleibt der bisherige Table-Storage-Pfad als
// Fallback für lokale Entwicklung/CI erhalten.
export function isKeyVaultConfigured() {
  return Boolean(process.env.AZURE_KEY_VAULT_URL);
}

function getOpenAiSecretName() {
  return process.env.OPENAI_SECRET_NAME ?? DEFAULT_OPENAI_SECRET_NAME;
}

export async function getStoredOpenAiApiKey(deps = {}) {
  if (isKeyVaultConfigured()) {
    return (await getSecretValue(getOpenAiSecretName(), deps)) ?? null;
  }

  return (await getTableValue(APP_CONFIG_OPENAI_KEY, deps)) ?? null;
}

export async function setStoredOpenAiApiKey(apiKey, deps = {}) {
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  if (isKeyVaultConfigured()) {
    if (trimmedKey.length > 0) {
      await setSecretValue(getOpenAiSecretName(), trimmedKey, deps);
    } else {
      await deleteSecretValue(getOpenAiSecretName(), deps);
    }
    return;
  }

  if (trimmedKey.length > 0) {
    await setTableValue(APP_CONFIG_OPENAI_KEY, trimmedKey, deps);
  } else {
    await deleteTableValue(APP_CONFIG_OPENAI_KEY, deps);
  }
}
