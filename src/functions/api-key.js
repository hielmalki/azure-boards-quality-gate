import { app } from '@azure/functions';
import { withAuth } from '../auth/require-auth.js';
import { assertAdmin } from '../auth/require-admin.js';
import { withCors } from '../utils/cors.js';
import { readJsonBody, mapErrorToResponse } from '../utils/http-responses.js';
import { getApiKeyStatus, saveOpenAiApiKey, deleteOpenAiApiKey } from '../services/api-key-service.js';
import { logError, logInfo } from '../utils/logger.js';

const getApiKeyStatusHandler = withAuth(async (request, context) => {
  try {
    const status = await getApiKeyStatus();
    logInfo('api_key.status_loaded', { configured: status.configured, source: status.source });
    return { jsonBody: status };
  } catch (error) {
    logError('api_key.status_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'API_KEY_STATUS_FAILED' });
  }
});

const saveOpenAiApiKeyHandler = withAuth(async (request, context) => {
  const body = await readJsonBody(request);

  try {
    await assertAdmin();
    const result = await saveOpenAiApiKey(body.apiKey);
    if (result.success) {
      logInfo('api_key.save_completed', { maskedKey: result.maskedKey });
    } else {
      logInfo('api_key.save_rejected', { error: result.error });
    }
    return { jsonBody: result };
  } catch (error) {
    logError('api_key.save_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'API_KEY_SAVE_FAILED' });
  }
});

const deleteOpenAiApiKeyHandler = withAuth(async (request, context) => {
  try {
    await assertAdmin();
    const result = await deleteOpenAiApiKey();
    logInfo('api_key.delete_completed', {});
    return { jsonBody: result };
  } catch (error) {
    logError('api_key.delete_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'API_KEY_DELETE_FAILED' });
  }
});

app.http('getApiKeyStatus', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'api-key',
  handler: withCors(getApiKeyStatusHandler),
});

app.http('saveOpenAiApiKey', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'api-key',
  handler: withCors(saveOpenAiApiKeyHandler),
});

app.http('deleteOpenAiApiKey', {
  methods: ['DELETE', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'api-key',
  handler: withCors(deleteOpenAiApiKeyHandler),
});

export const __testUtils = {
  getApiKeyStatusHandler,
  saveOpenAiApiKeyHandler,
  deleteOpenAiApiKeyHandler,
};
