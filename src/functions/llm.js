import { app } from '@azure/functions';
import { withAuth } from '../auth/require-auth.js';
import { getAuthContext } from '../auth/auth-context.js';
import { mapErrorToResponse } from '../utils/http-responses.js';
import { getLlmProviderStatus } from '../services/llm-service.js';
import { getTokenUsage } from '../services/ai-usage-service.js';
import { logError, logInfo } from '../utils/logger.js';

const getLlmProviderStatusHandler = withAuth(async (request, context) => {
  try {
    const providerStatus = getLlmProviderStatus();
    logInfo('llm.provider.status_loaded', {
      configuredProvider: providerStatus.configuredProvider.providerId,
      availableProviderCount: providerStatus.availableProviders.length,
    });
    return { jsonBody: providerStatus };
  } catch (error) {
    logError('llm.provider.status_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'LLM_PROVIDER_STATUS_FAILED' });
  }
});

const getTokenUsageHandler = withAuth(async (request, context) => {
  try {
    const tokenUsage = await getTokenUsage({
      accountId: getAuthContext()?.userId ?? null,
      installationId: getAuthContext()?.orgUrl ?? null,
    });
    logInfo('ai.token_usage.loaded', tokenUsage);
    return { jsonBody: tokenUsage };
  } catch (error) {
    logError('ai.token_usage.load_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'TOKEN_USAGE_LOAD_FAILED' });
  }
});

app.http('getLlmProviderStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'llm/provider',
  handler: getLlmProviderStatusHandler,
});

app.http('getTokenUsage', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'usage',
  handler: getTokenUsageHandler,
});

export const __testUtils = {
  getLlmProviderStatusHandler,
  getTokenUsageHandler,
};
