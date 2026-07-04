import { app } from '@azure/functions';
import { withAuth } from '../auth/require-auth.js';
import { getAuthContext } from '../auth/auth-context.js';
import { withCors } from '../utils/cors.js';
import { readJsonBody, mapErrorToResponse } from '../utils/http-responses.js';
import { getNormalizedIssue } from '../services/issue-service.js';
import { analyzeIssue } from '../services/analysis-service.js';
import { applySingleSuggestion, applyBatchSuggestions } from '../services/azure-devops-apply-service.js';
import { findDuplicateCandidates } from '../services/duplicate-check-service.js';
import { logError, logInfo } from '../utils/logger.js';

function currentUserId() {
  return getAuthContext()?.userId ?? null;
}

const getWorkItemHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;

  try {
    const issue = await getNormalizedIssue({ issueKey: workItemId });

    logInfo('work_item.normalized', {
      workItemId: issue.key,
      hasDescription: issue.fieldAvailability.hasDescription,
      hasAcceptanceCriteria: issue.fieldAvailability.hasAcceptanceCriteria,
      hasPriority: issue.fieldAvailability.hasPriority,
      hasStatus: issue.fieldAvailability.hasStatus,
    });

    return { jsonBody: issue };
  } catch (error) {
    logError('work_item.normalize_failed', error, { requestedWorkItemId: workItemId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'WORK_ITEM_FETCH_FAILED' });
  }
});

const analyzeWorkItemHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const analysis = await analyzeIssue({
      issueKey: workItemId,
      activeRulesetIds: body.activeRulesetIds,
      accountId: currentUserId(),
      installationId: getAuthContext()?.orgUrl ?? null,
    });

    logInfo('analysis.completed', {
      issueKey: analysis.issue.key,
      activeRulesetCount: analysis.activeRulesetIds.length,
      criticalCount: analysis.summary.critical,
      hintCount: analysis.summary.hints,
      fulfilledCount: analysis.summary.fulfilled,
      score: analysis.score,
    });

    return { jsonBody: analysis };
  } catch (error) {
    logError('analysis.failed', error, { requestedWorkItemId: workItemId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'ANALYSIS_FAILED' });
  }
});

const applyWorkItemFixHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const response = await applySingleSuggestion({
      issueKey: workItemId,
      suggestion: body.suggestion,
      accountId: currentUserId(),
    });

    logInfo('fix.apply.completed', {
      issueKey: response.issueKey,
      findingId: response.findingId,
      targetField: response.targetField,
      status: response.status,
      auditId: response.auditId,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('fix.apply.failed', error, {
      requestedWorkItemId: workItemId,
      findingId: body?.suggestion?.findingId ?? null,
    });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'FIX_APPLY_FAILED' });
  }
});

const applyWorkItemBatchFixHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const response = await applyBatchSuggestions({
      issueKey: workItemId,
      suggestions: body.suggestions,
      accountId: currentUserId(),
    });

    logInfo('fix.batch_apply.completed', {
      issueKey: response.issueKey,
      requested: response.summary.requested,
      succeeded: response.summary.succeeded,
      failed: response.summary.failed,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('fix.batch_apply.failed', error, {
      requestedWorkItemId: workItemId,
      suggestionCount: Array.isArray(body?.suggestions) ? body.suggestions.length : 0,
    });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'FIX_BATCH_APPLY_FAILED' });
  }
});

const checkWorkItemDuplicatesHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const result = await findDuplicateCandidates({
      issueKey: workItemId,
      summary: body.summary,
      projectKey: body.projectKey,
    });

    logInfo('duplicate_check.invoked', {
      issueKey: workItemId,
      candidateCount: result.candidates.length,
      skipped: result.skipped,
    });

    return { jsonBody: result };
  } catch (error) {
    logError('duplicate_check.invoke_failed', error, { requestedWorkItemId: workItemId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'DUPLICATE_CHECK_FAILED' });
  }
});

app.http('getWorkItem', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'work-items/{id}',
  handler: withCors(getWorkItemHandler),
});

app.http('analyzeWorkItem', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/analyze',
  handler: withCors(analyzeWorkItemHandler),
});

app.http('applyWorkItemFix', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/apply',
  handler: withCors(applyWorkItemFixHandler),
});

app.http('applyWorkItemBatchFix', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/apply-batch',
  handler: withCors(applyWorkItemBatchFixHandler),
});

app.http('checkWorkItemDuplicates', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/duplicates',
  handler: withCors(checkWorkItemDuplicatesHandler),
});

export const __testUtils = {
  getWorkItemHandler,
  analyzeWorkItemHandler,
  applyWorkItemFixHandler,
  applyWorkItemBatchFixHandler,
  checkWorkItemDuplicatesHandler,
};
