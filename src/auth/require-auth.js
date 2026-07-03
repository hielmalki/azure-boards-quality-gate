import { extractBearerToken, resolveUserId } from './sdk-token.js';
import { runWithAuthContext } from './auth-context.js';
import { logError } from '../utils/logger.js';

function unauthenticatedResponse(message) {
  return {
    status: 401,
    jsonBody: {
      error: {
        code: 'UNAUTHENTICATED',
        message,
      },
    },
  };
}

// Higher-Order-Wrapper für Azure-Functions-v4-Handler: extrahiert das
// SDK-Bearer-Token, löst die Nutzeridentität auf und stellt beides während der
// Ausführung des Handlers über den Auth-Kontext bereit (Schritt 3). Ersetzt
// den Forge-Mechanismus, der `context.accountId` bereits mitlieferte.
export function withAuth(handler, { resolveUserIdFn = resolveUserId } = {}) {
  return async (request, context) => {
    const token = extractBearerToken(request);

    if (!token) {
      return unauthenticatedResponse('Es wurde kein Azure-DevOps-Zugriffstoken übermittelt.');
    }

    let userId;
    try {
      userId = await resolveUserIdFn(token);
    } catch (error) {
      logError('auth.token_validation_failed', error);
      return unauthenticatedResponse('Das übermittelte Zugriffstoken ist ungültig oder abgelaufen.');
    }

    const authContext = {
      token,
      userId,
      orgUrl: process.env.AZURE_DEVOPS_ORG_URL,
      project: process.env.AZURE_DEVOPS_PROJECT,
    };

    return runWithAuthContext(authContext, () => handler(request, context));
  };
}
