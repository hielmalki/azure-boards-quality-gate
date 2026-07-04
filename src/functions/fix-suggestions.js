import { app } from '@azure/functions';
import { withAuth } from '../auth/require-auth.js';
import { getAuthContext } from '../auth/auth-context.js';
import { withCors } from '../utils/cors.js';
import { readJsonBody, mapErrorToResponse } from '../utils/http-responses.js';
import {
  generateSingleFixSuggestion,
  generateBatchFixSuggestions,
} from '../services/fix-suggestion-service.js';
import {
  startSingleFixSuggestionStream,
  getSingleFixSuggestionStreamResult,
} from '../services/fix-suggestion-stream-service.js';
import {
  assistAnalysisWithLlm,
  generateSuggestionWithLlm,
  reviseSuggestionWithLlm,
} from '../services/llm-service.js';
import { logError, logInfo } from '../utils/logger.js';

function usageContext() {
  return {
    accountId: getAuthContext()?.userId ?? null,
    installationId: getAuthContext()?.orgUrl ?? null,
  };
}

const generateWorkItemFixSuggestionHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const response = await generateSingleFixSuggestion({
      issueKey: workItemId,
      activeRulesetIds: body.activeRulesetIds,
      findingId: body.findingId,
      ...usageContext(),
    });

    logInfo('fix.suggestion.generated', {
      issueKey: response.issueKey,
      status: response.status,
      findingId: response.suggestion?.findingId ?? null,
      targetField: response.suggestion?.targetField ?? null,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('fix.suggestion.generate_failed', error, {
      requestedWorkItemId: workItemId,
      findingId: body?.findingId ?? null,
    });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'FIX_SUGGESTION_GENERATE_FAILED' });
  }
});

const generateWorkItemBatchFixSuggestionsHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const response = await generateBatchFixSuggestions({
      issueKey: workItemId,
      activeRulesetIds: body.activeRulesetIds,
      findingIds: body.findingIds,
      ...usageContext(),
    });

    logInfo('fix.batch_suggestions.generated', {
      issueKey: response.issueKey,
      requested: response.summary.requested,
      succeeded: response.summary.succeeded,
      failed: response.summary.failed,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('fix.batch_suggestions.generate_failed', error, {
      requestedWorkItemId: workItemId,
      findingCount: Array.isArray(body?.findingIds) ? body.findingIds.length : 0,
    });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'FIX_BATCH_SUGGESTIONS_GENERATE_FAILED' });
  }
});

const startWorkItemFixSuggestionStreamHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const response = await startSingleFixSuggestionStream({
      issueKey: workItemId,
      activeRulesetIds: body.activeRulesetIds,
      findingId: body.findingId,
      ...usageContext(),
    });

    logInfo('fix.suggestion.stream.started', {
      issueKey: response.issueKey,
      findingId: response.findingId,
      runId: response.runId,
      status: response.status,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('fix.suggestion.stream.start_failed', error, {
      requestedWorkItemId: workItemId,
      findingId: body?.findingId ?? null,
    });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'FIX_SUGGESTION_STREAM_START_FAILED' });
  }
});

const getWorkItemFixSuggestionStreamResultHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const runId = request.params.runId;
  const findingId = request.query.get('findingId');

  try {
    const response = await getSingleFixSuggestionStreamResult({
      issueKey: workItemId,
      findingId,
      runId,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('fix.suggestion.stream.load_failed', error, {
      requestedWorkItemId: workItemId,
      findingId,
      runId,
    });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'FIX_SUGGESTION_STREAM_LOAD_FAILED' });
  }
});

const assistWorkItemAnalysisWithLlmHandler = withAuth(async (request, context) => {
  const body = await readJsonBody(request);

  try {
    const response = await assistAnalysisWithLlm(body, usageContext());
    return { jsonBody: response };
  } catch (error) {
    logError('llm.analysis_assist.invoke_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'LLM_ANALYSIS_ASSIST_FAILED' });
  }
});

const generateWorkItemSuggestionWithLlmHandler = withAuth(async (request, context) => {
  const body = await readJsonBody(request);

  try {
    const response = await generateSuggestionWithLlm(body, usageContext());
    return { jsonBody: response };
  } catch (error) {
    logError('llm.suggestion.invoke_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'LLM_SUGGESTION_FAILED' });
  }
});

const reviseWorkItemSuggestionWithLlmHandler = withAuth(async (request, context) => {
  const body = await readJsonBody(request);

  try {
    const response = await reviseSuggestionWithLlm(body, usageContext());
    return { jsonBody: response };
  } catch (error) {
    logError('llm.suggestion.revise_invoke_failed', error);
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'LLM_SUGGESTION_REVISE_FAILED' });
  }
});

app.http('generateWorkItemFixSuggestion', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/fix-suggestions',
  handler: withCors(generateWorkItemFixSuggestionHandler),
});

app.http('generateWorkItemBatchFixSuggestions', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/fix-suggestions/batch',
  handler: withCors(generateWorkItemBatchFixSuggestionsHandler),
});

app.http('startWorkItemFixSuggestionStream', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/fix-suggestions/stream',
  handler: withCors(startWorkItemFixSuggestionStreamHandler),
});

app.http('getWorkItemFixSuggestionStreamResult', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/fix-suggestions/stream/{runId}',
  handler: withCors(getWorkItemFixSuggestionStreamResultHandler),
});

app.http('assistWorkItemAnalysisWithLlm', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'llm/analysis-assist',
  handler: withCors(assistWorkItemAnalysisWithLlmHandler),
});

app.http('generateWorkItemSuggestionWithLlm', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'llm/suggestion',
  handler: withCors(generateWorkItemSuggestionWithLlmHandler),
});

app.http('reviseWorkItemSuggestionWithLlm', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'llm/suggestion/revise',
  handler: withCors(reviseWorkItemSuggestionWithLlmHandler),
});

export const __testUtils = {
  generateWorkItemFixSuggestionHandler,
  generateWorkItemBatchFixSuggestionsHandler,
  startWorkItemFixSuggestionStreamHandler,
  getWorkItemFixSuggestionStreamResultHandler,
  assistWorkItemAnalysisWithLlmHandler,
  generateWorkItemSuggestionWithLlmHandler,
  reviseWorkItemSuggestionWithLlmHandler,
};
