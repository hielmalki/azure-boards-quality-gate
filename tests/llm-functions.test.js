import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/functions/llm.js';
import { fakeRequest, fakeContext } from './helpers/http-test-utils.js';

const { getLlmProviderStatusHandler, getTokenUsageHandler } = __testUtils;

test('every llm handler returns 401 without an Authorization header', async () => {
  for (const handler of [getLlmProviderStatusHandler, getTokenUsageHandler]) {
    const response = await handler(fakeRequest({ token: null }), fakeContext());
    assert.equal(response.status, 401);
    assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
  }
});
