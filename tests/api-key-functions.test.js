import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/functions/api-key.js';
import { fakeRequest, fakeContext, installFetchRouter, profileRoute, permissionsRoute } from './helpers/http-test-utils.js';

process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test-org';

const { getApiKeyStatusHandler, saveOpenAiApiKeyHandler, deleteOpenAiApiKeyHandler } = __testUtils;

const adminHandlers = [
  { name: 'saveOpenAiApiKey', handler: saveOpenAiApiKeyHandler },
  { name: 'deleteOpenAiApiKey', handler: deleteOpenAiApiKeyHandler },
];

test('every api-key handler returns 401 without an Authorization header', async () => {
  const handlers = [getApiKeyStatusHandler, ...adminHandlers.map(entry => entry.handler)];

  for (const handler of handlers) {
    const response = await handler(fakeRequest({ token: null }), fakeContext());
    assert.equal(response.status, 401);
    assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
  }
});

test('admin-gated api-key handlers return 403 when the user lacks admin permission', async () => {
  const restoreFetch = installFetchRouter([profileRoute(), permissionsRoute({ granted: false })]);

  try {
    for (const { name, handler } of adminHandlers) {
      const response = await handler(fakeRequest(), fakeContext());
      assert.equal(response.status, 403, `${name} should be forbidden`);
      assert.equal(response.jsonBody.error.code, 'FORBIDDEN');
    }
  } finally {
    restoreFetch();
  }
});
