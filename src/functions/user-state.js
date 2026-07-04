import { app } from '@azure/functions';
import { withAuth } from '../auth/require-auth.js';
import { getAuthContext } from '../auth/auth-context.js';
import { withCors } from '../utils/cors.js';
import { readJsonBody, mapErrorToResponse } from '../utils/http-responses.js';
import { getUserState, updateUserState } from '../services/user-state-service.js';
import { logError, logInfo } from '../utils/logger.js';

const getUserStateHandler = withAuth(async (request, context) => {
  const userId = getAuthContext()?.userId ?? null;

  try {
    const userState = await getUserState(userId);
    logInfo('user_state.loaded', {
      hasUsedPlugin: userState.hasUsedPlugin,
      preferredRulesetCount: userState.preferredRulesetIds.length,
    });
    return { jsonBody: userState };
  } catch (error) {
    logError('user_state.load_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'USER_STATE_LOAD_FAILED' });
  }
});

const updateUserStateHandler = withAuth(async (request, context) => {
  const userId = getAuthContext()?.userId ?? null;
  const body = await readJsonBody(request);

  try {
    const userState = await updateUserState(userId, body);
    logInfo('user_state.updated', {
      hasUsedPlugin: userState.hasUsedPlugin,
      preferredRulesetCount: userState.preferredRulesetIds.length,
      updatedFields: Object.keys(body),
    });
    return { jsonBody: userState };
  } catch (error) {
    logError('user_state.update_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'USER_STATE_UPDATE_FAILED' });
  }
});

app.http('getUserState', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'user-state',
  handler: withCors(getUserStateHandler),
});

app.http('updateUserState', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'user-state',
  handler: withCors(updateUserStateHandler),
});

export const __testUtils = {
  getUserStateHandler,
  updateUserStateHandler,
};
