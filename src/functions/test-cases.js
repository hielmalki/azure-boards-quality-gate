import { app } from '@azure/functions';
import { withAuth } from '../auth/require-auth.js';
import { getAuthContext } from '../auth/auth-context.js';
import { withCors } from '../utils/cors.js';
import { readJsonBody, mapErrorToResponse } from '../utils/http-responses.js';
import {
  generateTestCases,
  createTestCaseWorkItems,
  attachTestCasesToIssue,
  listExistingTestCases,
  generateStepsForExisting,
  appendStepsToTestCase,
} from '../services/test-case-service.js';
import { logError, logInfo } from '../utils/logger.js';

function usageContext() {
  return {
    accountId: getAuthContext()?.userId ?? null,
    installationId: getAuthContext()?.orgUrl ?? null,
  };
}

const generateWorkItemTestCasesHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const response = await generateTestCases({
      issueKey: workItemId,
      instruction: body?.instruction ?? null,
      config: body?.config ?? null,
      ...usageContext(),
    });

    logInfo('test_cases.generated', {
      issueKey: response.issueKey,
      testCaseCount: response.testCases.length,
      existingCount: response.existingCount,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('test_cases.generate_failed', error, { requestedWorkItemId: workItemId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'TEST_CASES_GENERATE_FAILED' });
  }
});

const listWorkItemTestCasesHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;

  try {
    const response = await listExistingTestCases({ issueKey: workItemId });

    return { jsonBody: response };
  } catch (error) {
    logError('test_cases.list_failed', error, { requestedWorkItemId: workItemId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'TEST_CASES_LIST_FAILED' });
  }
});

const createWorkItemTestCasesHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const response = await createTestCaseWorkItems({
      issueKey: workItemId,
      testCases: body.testCases,
    });

    logInfo('test_cases.created', {
      issueKey: response.issueKey,
      requested: response.summary.requested,
      succeeded: response.summary.succeeded,
      failed: response.summary.failed,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('test_cases.create_failed', error, {
      requestedWorkItemId: workItemId,
      testCaseCount: Array.isArray(body?.testCases) ? body.testCases.length : 0,
    });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'TEST_CASES_CREATE_FAILED' });
  }
});

const attachWorkItemTestCasesHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const body = await readJsonBody(request);

  try {
    const response = await attachTestCasesToIssue({
      issueKey: workItemId,
      testCases: body.testCases,
    });

    logInfo('test_cases.attached', {
      issueKey: response.issueKey,
      attachedCount: response.attachedCount,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('test_cases.attach_failed', error, {
      requestedWorkItemId: workItemId,
      testCaseCount: Array.isArray(body?.testCases) ? body.testCases.length : 0,
    });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'TEST_CASES_ATTACH_FAILED' });
  }
});

const generateTestCaseStepsHandler = withAuth(async (request, context) => {
  const workItemId = request.params.id;
  const testCaseId = request.params.testCaseId;
  const body = await readJsonBody(request);

  try {
    const response = await generateStepsForExisting({
      issueKey: workItemId,
      testCaseId,
      testCaseTitle: body?.testCaseTitle ?? null,
      existingSteps: Array.isArray(body?.existingSteps) ? body.existingSteps : [],
      instruction: body?.instruction ?? null,
      ...usageContext(),
    });

    logInfo('test_case_steps.generated', {
      issueKey: response.issueKey,
      testCaseId,
      newStepCount: response.newSteps.length,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('test_case_steps.generate_failed', error, { requestedWorkItemId: workItemId, testCaseId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'TEST_CASE_STEPS_GENERATE_FAILED' });
  }
});

const applyTestCaseStepsHandler = withAuth(async (request, context) => {
  const testCaseId = request.params.testCaseId;
  const body = await readJsonBody(request);

  try {
    const response = await appendStepsToTestCase({
      testCaseId,
      newSteps: Array.isArray(body?.newSteps) ? body.newSteps : [],
    });

    logInfo('test_case_steps.applied', {
      testCaseId,
      stepCount: response.stepCount,
    });

    return { jsonBody: response };
  } catch (error) {
    logError('test_case_steps.apply_failed', error, { testCaseId });
    context.error(error);
    return mapErrorToResponse(error, { fallbackCode: 'TEST_CASE_STEPS_APPLY_FAILED' });
  }
});

app.http('generateWorkItemTestCases', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/test-cases',
  handler: withCors(generateWorkItemTestCasesHandler),
});

app.http('listWorkItemTestCases', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/test-cases',
  handler: withCors(listWorkItemTestCasesHandler),
});

app.http('createWorkItemTestCases', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/test-cases/create',
  handler: withCors(createWorkItemTestCasesHandler),
});

app.http('attachWorkItemTestCases', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/test-cases/attach',
  handler: withCors(attachWorkItemTestCasesHandler),
});

app.http('generateTestCaseSteps', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/test-cases/{testCaseId}/steps',
  handler: withCors(generateTestCaseStepsHandler),
});

app.http('applyTestCaseSteps', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'work-items/{id}/test-cases/{testCaseId}/steps/apply',
  handler: withCors(applyTestCaseStepsHandler),
});

export const __testUtils = {
  generateWorkItemTestCasesHandler,
  listWorkItemTestCasesHandler,
  generateTestCaseStepsHandler,
  applyTestCaseStepsHandler,
  createWorkItemTestCasesHandler,
  attachWorkItemTestCasesHandler,
};
