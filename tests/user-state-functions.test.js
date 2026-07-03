import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/functions/user-state.js';
import { fakeRequest, fakeContext } from './helpers/http-test-utils.js';

const { getUserStateHandler, updateUserStateHandler } = __testUtils;

test('every user-state handler returns 401 without an Authorization header', async () => {
  for (const handler of [getUserStateHandler, updateUserStateHandler]) {
    const response = await handler(fakeRequest({ token: null }), fakeContext());
    assert.equal(response.status, 401);
    assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
  }
});
