import test from 'node:test';
import assert from 'node:assert/strict';
import { withCors } from '../src/utils/cors.js';
import { fakeContext, fakeRequest } from './helpers/http-test-utils.js';

test('withCors answers OPTIONS preflight without invoking the wrapped handler', async () => {
  let invoked = false;
  const handler = withCors(async () => {
    invoked = true;
    return { jsonBody: { ok: true } };
  });

  const response = await handler(fakeRequest({ method: 'OPTIONS', token: null }), fakeContext());

  assert.equal(response.status, 204);
  assert.equal(invoked, false);
  assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
  assert.match(response.headers['Access-Control-Allow-Methods'], /OPTIONS/);
  assert.match(response.headers['Access-Control-Allow-Headers'], /authorization/);
});

test('withCors attaches CORS headers to regular responses', async () => {
  const handler = withCors(async () => ({
    status: 200,
    headers: {
      'X-Test': 'kept',
    },
    jsonBody: { ok: true },
  }));

  const response = await handler(fakeRequest({ method: 'GET' }), fakeContext());

  assert.equal(response.status, 200);
  assert.equal(response.headers['Access-Control-Allow-Origin'], '*');
  assert.equal(response.headers['X-Test'], 'kept');
  assert.deepEqual(response.jsonBody, { ok: true });
});
