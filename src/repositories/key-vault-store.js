// Dünner Key-Value-Wrapper um Azure Key Vault Secrets.
//
// Härtet die verbleibende Schritt-2-Lücke (siehe docs/azure-boards-migration-architektur.md,
// §7 „Secret-Speicherung"): Secrets wie der OpenAI-API-Key sollen nicht als Klartext in
// Azure Table Storage liegen. Parallel zu table-kv-store.js gehalten (gleiche
// get/set/delete-Signatur, gleiche `{ secretClient }`-Injektion für Tests), aber ohne
// JSON-Serialisierung – Key-Vault-Secrets sind schlichte Strings, keine strukturierten
// Datensätze wie Analyse-/Audit-Einträge.
//
// Auth: DefaultAzureCredential – nutzt die System-assigned Managed Identity der Function
// App in Azure bzw. `az login`/Umgebungsvariablen lokal. Kein Secret im Code oder in
// App-Settings nötig, um selbst auf den Vault zuzugreifen.

import { SecretClient } from '@azure/keyvault-secrets';
import { DefaultAzureCredential } from '@azure/identity';

let cachedDefaultClient = null;

function getVaultUrl() {
  const vaultUrl = process.env.AZURE_KEY_VAULT_URL;

  if (!vaultUrl) {
    throw new Error('Azure Key Vault ist nicht konfiguriert. AZURE_KEY_VAULT_URL muss gesetzt sein.');
  }

  return vaultUrl;
}

function getDefaultSecretClient() {
  if (!cachedDefaultClient) {
    cachedDefaultClient = new SecretClient(getVaultUrl(), new DefaultAzureCredential());
  }

  return cachedDefaultClient;
}

function isNotFoundError(error) {
  return error?.statusCode === 404 || error?.code === 'SecretNotFound';
}

// Key-Vault-Secret-Namen erlauben nur alphanumerische Zeichen und Bindestriche;
// unsere internen KV-Keys (z. B. "app-config:openai-api-key") nutzen Doppelpunkte.
export function toSecretName(key) {
  return key.replace(/[^A-Za-z0-9-]/g, '-');
}

export async function getValue(key, { secretClient = getDefaultSecretClient() } = {}) {
  try {
    const secret = await secretClient.getSecret(toSecretName(key));
    return secret?.value ?? null;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function setValue(key, value, { secretClient = getDefaultSecretClient() } = {}) {
  await secretClient.setSecret(toSecretName(key), value);
}

export async function deleteValue(key, { secretClient = getDefaultSecretClient() } = {}) {
  try {
    const poller = await secretClient.beginDeleteSecret(toSecretName(key));
    await poller.pollUntilDone();
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}
