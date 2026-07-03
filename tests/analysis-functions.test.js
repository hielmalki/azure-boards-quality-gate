import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/functions/analysis.js';
import { fakeRequest, fakeContext } from './helpers/http-test-utils.js';

const { startWorkItemAnalysisHandler, getWorkItemAnalysisResultHandler } = __testUtils;

test('startWorkItemAnalysis returns 401 without an Authorization header', async () => {
  const response = await startWorkItemAnalysisHandler(
    fakeRequest({ token: null, params: { id: '42' } }),
    fakeContext()
  );
  assert.equal(response.status, 401);
  assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
});

test('getWorkItemAnalysisResult returns 401 without an Authorization header', async () => {
  const response = await getWorkItemAnalysisResultHandler(
    fakeRequest({ token: null, params: { id: '42' } }),
    fakeContext()
  );
  assert.equal(response.status, 401);
  assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
});
