import { app } from '@azure/functions';
import { withAuth } from '../auth/require-auth.js';
import { getAuthContext } from '../auth/auth-context.js';
import { withCors } from '../utils/cors.js';
import { readJsonBody, mapErrorToResponse } from '../utils/http-responses.js';
import { startIssueAnalysis, getIssueAnalysisResult } from '../services/analysis-run-service.js';
import { logError, logInfo } from '../utils/logger.js';

const startWorkItemAnalysisHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const analysisRun = await startIssueAnalysis({
      issueKey: workItemId,
      activeRulesetIds: body.activeRulesetIds,
      accountId: getAuthContext()?.userId ?? null,
      installationId: getAuthContext()?.orgUrl ?? null,
      normalizedIssue: body.normalizedIssue,
    });

    logInfo('analysis.run.started', {
      issueKey: analysisRun.issueKey,
      status: analysisRun.status,
      resultAvailable: analysisRun.resultAvailable,
    });

    return { jsonBody: analysisRun };
  } catch (error) {
    logError('analysis.run.start_failed', error, { requestedWorkItemId: workItemId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'ANALYSIS_RUN_START_FAILED' });
  }
});

const getWorkItemAnalysisResultHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;

  try {
    const analysisResult = await getIssueAnalysisResult({ issueKey: workItemId });

    logInfo('analysis.result.loaded', {
      issueKey: analysisResult.issueKey,
      status: analysisResult.status,
      resultAvailable: analysisResult.resultAvailable,
    });

    return { jsonBody: analysisResult };
  } catch (error) {
    logError('analysis.result.load_failed', error, { requestedWorkItemId: workItemId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'ANALYSIS_RESULT_LOAD_FAILED' });
  }
});

app.http('startWorkItemAnalysis', {
  methods: ['POST', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/analysis',
  handler: withCors(startWorkItemAnalysisHandler),
});

app.http('getWorkItemAnalysisResult', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/analysis',
  handler: withCors(getWorkItemAnalysisResultHandler),
});

export const __testUtils = {
  startWorkItemAnalysisHandler,
  getWorkItemAnalysisResultHandler,
};
