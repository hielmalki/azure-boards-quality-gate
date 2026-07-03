import { invoke } from './api/invoke';

export type ApiKeySource = 'keyvault' | 'storage' | 'env' | 'none';

export type ApiKeyStatus = {
  configured: boolean;
  source: ApiKeySource;
  maskedKey: string | null;
};

export type SaveApiKeyResult = {
  success: boolean;
  maskedKey?: string;
  error?: string;
};

export async function getApiKeyStatus(): Promise<ApiKeyStatus> {
  const payload = await invoke<Partial<ApiKeyStatus>>('getApiKeyStatus');
  return {
    configured: Boolean(payload?.configured),
    source: (payload?.source as ApiKeySource) ?? 'none',
    maskedKey: typeof payload?.maskedKey === 'string' ? payload.maskedKey : null,
  };
}

export async function deleteOpenAiApiKey(): Promise<{ success: boolean }> {
  const result = await invoke<{ success: boolean }>('deleteOpenAiApiKey');
  return { success: Boolean(result?.success) };
}

export async function saveAndValidateOpenAiApiKey(apiKey: string): Promise<SaveApiKeyResult> {
  const result = await invoke<SaveApiKeyResult>('saveOpenAiApiKey', { apiKey });
  return {
    success: Boolean(result?.success),
    maskedKey: typeof result?.maskedKey === 'string' ? result.maskedKey : undefined,
    error: typeof result?.error === 'string' ? result.error : undefined,
  };
}
