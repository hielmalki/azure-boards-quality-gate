import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/functions/test-cases.js';
import { fakeRequest, fakeContext } from './helpers/http-test-utils.js';

const {
  generateWorkItemTestCasesHandler,
  listWorkItemTestCasesHandler,
  createWorkItemTestCasesHandler,
  attachWorkItemTestCasesHandler,
  generateTestCaseStepsHandler,
  applyTestCaseStepsHandler,
} = __testUtils;

test('every test-cases handler returns 401 without an Authorization header', async () => {
  const handlers = [
    generateWorkItemTestCasesHandler,
    listWorkItemTestCasesHandler,
    createWorkItemTestCasesHandler,
    attachWorkItemTestCasesHandler,
    generateTestCaseStepsHandler,
    applyTestCaseStepsHandler,
  ];

  for (const handler of handlers) {
    const response = await handler(
      fakeRequest({ token: null, params: { id: '42', testCaseId: '501' } }),
      fakeContext()
    );
    assert.equal(response.status, 401);
    assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
  }
});
