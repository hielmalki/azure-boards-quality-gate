import {
  getStoredOpenAiApiKey,
  setStoredOpenAiApiKey,
  isKeyVaultConfigured,
} from '../repositories/app-config-repository.js';
import { getOpenAiBaseUrl } from '../providers/llm/provider-config.js';
import { logError, logInfo } from '../utils/logger.js';

function maskApiKey(key) {
  if (typeof key !== 'string' || key.length < 8) {
    return '***';
  }
  const prefix = key.slice(0, 10);
  const suffix = key.slice(-4);
  return `${prefix}...${suffix}`;
}

export async function getApiKeyStatus() {
  const storedKey = await getStoredOpenAiApiKey();

  if (storedKey) {
    return {
      configured: true,
      source: isKeyVaultConfigured() ? 'keyvault' : 'storage',
      maskedKey: maskApiKey(storedKey),
    };
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      configured: true,
      source: 'env',
      maskedKey: maskApiKey(process.env.OPENAI_API_KEY),
    };
  }

  return { configured: false, source: 'none', maskedKey: null };
}

export async function deleteOpenAiApiKey() {
  await setStoredOpenAiApiKey(null);
  logInfo('api_key.deleted', {});
  return { success: true };
}

export async function saveOpenAiApiKey(apiKey, { fetchFn = globalThis.fetch } = {}) {
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return { success: false, error: 'API key must not be empty.' };
  }

  const trimmedKey = apiKey.trim();
  const validationResult = await validateKeyAgainstOpenAi(trimmedKey, fetchFn);

  if (!validationResult.valid) {
    return { success: false, error: validationResult.error };
  }

  await setStoredOpenAiApiKey(trimmedKey);
  logInfo('api_key.saved', { maskedKey: maskApiKey(trimmedKey) });

  return { success: true, maskedKey: maskApiKey(trimmedKey) };
}

async function validateKeyAgainstOpenAi(apiKey, fetchFn = globalThis.fetch) {
  const baseUrl = getOpenAiBaseUrl();

  try {
    const response = await fetchFn(`${baseUrl}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      return { valid: true };
    }

    if (response.status === 401) {
      return { valid: false, error: 'API key is invalid or has been revoked.' };
    }

    if (response.status === 429) {
      // Rate-Limit bedeutet: Schlüssel ist gültig, aber das Kontingent ist überschritten.
      return { valid: true };
    }

    return { valid: false, error: `OpenAI returned status ${response.status}.` };
  } catch (error) {
    logError('api_key.validation_failed', error);
    return { valid: false, error: 'Could not reach OpenAI to validate the key.' };
  }
}
