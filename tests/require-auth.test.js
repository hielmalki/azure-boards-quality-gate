import test from 'node:test';
import assert from 'node:assert/strict';
import { withAuth } from '../src/auth/require-auth.js';
import { getAuthContext } from '../src/auth/auth-context.js';

function requestWithToken(token) {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null;
      },
    },
  };
}

test('withAuth returns 401 when no Authorization header is present', async () => {
  const handler = withAuth(async () => ({ status: 200, jsonBody: { ok: true } }));

  const response = await handler(requestWithToken(null), {});

  assert.equal(response.status, 401);
  assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
});

test('withAuth returns 401 when the token cannot be validated', async () => {
  const resolveUserIdFn = async () => {
    throw new Error('invalid token');
  };
  const handler = withAuth(async () => ({ status: 200, jsonBody: { ok: true } }), { resolveUserIdFn });

  const response = await handler(requestWithToken('bad-token'), {});

  assert.equal(response.status, 401);
  assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
});

test('withAuth exposes the resolved auth context to the wrapped handler', async () => {
  process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test-org';
  process.env.AZURE_DEVOPS_PROJECT = 'QualityGate';

  const resolveUserIdFn = async token => `resolved-for-${token}`;
  let observedContext;

  const handler = withAuth(
    async () => {
      observedContext = getAuthContext();
      return { status: 200, jsonBody: { ok: true } };
    },
    { resolveUserIdFn }
  );

  const response = await handler(requestWithToken('good-token'), {});

  assert.equal(response.status, 200);
  assert.equal(observedContext.token, 'good-token');
  assert.equal(observedContext.userId, 'resolved-for-good-token');
  assert.equal(observedContext.orgUrl, 'https://dev.azure.com/test-org');
  assert.equal(observedContext.project, 'QualityGate');
});

test('withAuth does not leak the auth context after the handler returns', async () => {
  const resolveUserIdFn = async () => 'user-1';
  const handler = withAuth(async () => ({ status: 200, jsonBody: {} }), { resolveUserIdFn });

  await handler(requestWithToken('token'), {});

  assert.equal(getAuthContext(), undefined);
});
