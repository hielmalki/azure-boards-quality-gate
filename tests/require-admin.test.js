import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAdmin } from '../src/auth/require-admin.js';
import { runWithAuthContext } from '../src/auth/auth-context.js';

const baseContext = {
  token: 'user-token',
  orgUrl: 'https://dev.azure.com/test-org',
  project: 'QualityGate',
  userId: 'user-guid',
};

test('assertAdmin fails closed when there is no auth context', async () => {
  await assert.rejects(() => assertAdmin(), error => error.code === 'FORBIDDEN');
});

test('assertAdmin resolves via the allowlist without calling the permissions endpoint', async () => {
  process.env.ADO_ADMIN_USER_IDS = 'user-guid';
  const fetchFn = async () => {
    throw new Error('fetch should not be called when the user is allowlisted');
  };

  await assert.doesNotReject(() => runWithAuthContext(baseContext, () => assertAdmin({ fetchFn })));
  delete process.env.ADO_ADMIN_USER_IDS;
});

test('assertAdmin resolves when the permissions endpoint confirms the permission', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ value: [true] }) });

  await assert.doesNotReject(() => runWithAuthContext(baseContext, () => assertAdmin({ fetchFn })));
});

test('assertAdmin fails closed when the permissions endpoint denies the permission', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ value: [false] }) });

  await assert.rejects(
    () => runWithAuthContext(baseContext, () => assertAdmin({ fetchFn })),
    error => error.code === 'FORBIDDEN'
  );
});

test('assertAdmin fails closed when the permissions endpoint responds with a non-ok status', async () => {
  const fetchFn = async () => ({ ok: false, status: 500, statusText: 'Internal Server Error' });

  await assert.rejects(
    () => runWithAuthContext(baseContext, () => assertAdmin({ fetchFn })),
    error => error.code === 'FORBIDDEN'
  );
});

test('assertAdmin fails closed when the request itself throws (network error)', async () => {
  const fetchFn = async () => {
    throw new Error('network down');
  };

  await assert.rejects(
    () => runWithAuthContext(baseContext, () => assertAdmin({ fetchFn })),
    error => error.code === 'FORBIDDEN'
  );
});

test('assertAdmin calls the permissions API scoped to the org URL from the auth context', async () => {
  let calledUrl;
  const fetchFn = async url => {
    calledUrl = url.toString();
    return { ok: true, json: async () => ({ value: true }) };
  };

  await runWithAuthContext(baseContext, () => assertAdmin({ fetchFn }));

  assert.match(calledUrl, /^https:\/\/dev\.azure\.com\/test-org\/_apis\/permissions\//);
  assert.match(calledUrl, /api-version=7\.1/);
});
