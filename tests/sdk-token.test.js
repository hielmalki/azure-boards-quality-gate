import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBearerToken, resolveUserId } from '../src/auth/sdk-token.js';

function requestWithHeadersMap(authorizationValue) {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === 'authorization' ? authorizationValue : null;
      },
    },
  };
}

test('extractBearerToken reads the token from a Headers-like get() API', () => {
  const request = requestWithHeadersMap('Bearer my-token-value');
  assert.equal(extractBearerToken(request), 'my-token-value');
});

test('extractBearerToken reads the token from a plain headers object', () => {
  assert.equal(extractBearerToken({ headers: { authorization: 'Bearer plain-token' } }), 'plain-token');
  assert.equal(extractBearerToken({ headers: { Authorization: 'Bearer capitalized' } }), 'capitalized');
});

test('extractBearerToken is case-insensitive on the Bearer scheme and trims whitespace', () => {
  assert.equal(extractBearerToken({ headers: { authorization: '  bearer   spaced-token  ' } }), 'spaced-token');
});

test('extractBearerToken returns null when there is no Authorization header', () => {
  assert.equal(extractBearerToken({ headers: {} }), null);
  assert.equal(extractBearerToken({}), null);
});

test('extractBearerToken returns null for non-Bearer schemes', () => {
  assert.equal(extractBearerToken({ headers: { authorization: 'Basic dXNlcjpwYXNz' } }), null);
});

test('resolveUserId returns the authenticated user id on a successful response', async () => {
  process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test-org';
  let requestedUrl;
  const fetchFn = async url => {
    requestedUrl = String(url);
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({ authenticatedUser: { id: 'user-guid-123' } }),
    };
  };

  const userId = await resolveUserId('some-token', { fetchFn });
  assert.equal(userId, 'user-guid-123');
  assert.match(requestedUrl, /\/_apis\/connectionData/);
  delete process.env.AZURE_DEVOPS_ORG_URL;
});

test('resolveUserId throws a descriptive error on a non-ok response', async () => {
  process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test-org';
  const fetchFn = async () => ({ ok: false, status: 401, statusText: 'Unauthorized' });

  await assert.rejects(
    () => resolveUserId('bad-token', { fetchFn }),
    /Failed to resolve Azure DevOps identity: 401 Unauthorized/
  );
  delete process.env.AZURE_DEVOPS_ORG_URL;
});

test('resolveUserId throws when the connectionData response has no authenticated user id', async () => {
  process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test-org';
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ authenticatedUser: {} }),
  });

  await assert.rejects(() => resolveUserId('token', { fetchFn }), /did not include an authenticated user id/);
  delete process.env.AZURE_DEVOPS_ORG_URL;
});

test('resolveUserId throws when AZURE_DEVOPS_ORG_URL is not configured', async () => {
  delete process.env.AZURE_DEVOPS_ORG_URL;

  await assert.rejects(() => resolveUserId('token', { fetchFn: async () => ({}) }), /AZURE_DEVOPS_ORG_URL/);
});
