import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/functions/rulesets.js';
import { fakeRequest, fakeContext, installFetchRouter, profileRoute, permissionsRoute } from './helpers/http-test-utils.js';

process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test-org';

const {
  getRulesetsStateHandler,
  saveActiveRulesetsHandler,
  createCustomRulesetHandler,
  updateCustomRulesetHandler,
  deleteCustomRulesetHandler,
} = __testUtils;

const adminHandlers = [
  { name: 'saveActiveRulesets', handler: saveActiveRulesetsHandler },
  { name: 'createCustomRuleset', handler: createCustomRulesetHandler },
  { name: 'updateCustomRuleset', handler: updateCustomRulesetHandler },
  { name: 'deleteCustomRuleset', handler: deleteCustomRulesetHandler },
];

test('every rulesets handler returns 401 without an Authorization header', async () => {
  const handlers = [getRulesetsStateHandler, ...adminHandlers.map(entry => entry.handler)];

  for (const handler of handlers) {
    const response = await handler(fakeRequest({ token: null, params: { id: 'r1' } }), fakeContext());
    assert.equal(response.status, 401);
    assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
  }
});

test('admin-gated rulesets handlers return 403 when the user lacks admin permission', async () => {
  const restoreFetch = installFetchRouter([profileRoute(), permissionsRoute({ granted: false })]);

  try {
    for (const { name, handler } of adminHandlers) {
      const response = await handler(fakeRequest({ params: { id: 'r1' } }), fakeContext());
      assert.equal(response.status, 403, `${name} should be forbidden`);
      assert.equal(response.jsonBody.error.code, 'FORBIDDEN');
    }
  } finally {
    restoreFetch();
  }
});
