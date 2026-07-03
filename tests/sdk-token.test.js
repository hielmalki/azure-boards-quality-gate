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

test('resolveUserId returns the profile id on a successful response', async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ id: 'user-guid-123', displayName: 'Test User' }),
  });

  const userId = await resolveUserId('some-token', { fetchFn });
  assert.equal(userId, 'user-guid-123');
});

test('resolveUserId throws a descriptive error on a non-ok response', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, statusText: 'Unauthorized' });

  await assert.rejects(
    () => resolveUserId('bad-token', { fetchFn }),
    /Failed to resolve Azure DevOps identity: 401 Unauthorized/
  );
});

test('resolveUserId throws when the profile response has no id', async () => {
  const fetchFn = async () => ({ ok: true, status: 200, statusText: 'OK', json: async () => ({}) });

  await assert.rejects(() => resolveUserId('token', { fetchFn }), /did not include an id/);
});
