import test from 'node:test';
import assert from 'node:assert/strict';
import { runWithAuthContext, getAuthContext } from '../src/auth/auth-context.js';

test('getAuthContext returns undefined outside of runWithAuthContext', () => {
  assert.equal(getAuthContext(), undefined);
});

test('runWithAuthContext makes the context available inside the callback and nested async calls', async () => {
  const context = { token: 'abc', userId: 'user-1', orgUrl: 'https://dev.azure.com/org', project: 'Proj' };

  const observed = await runWithAuthContext(context, async () => {
    await Promise.resolve();
    return getAuthContext();
  });

  assert.deepEqual(observed, context);
});

test('runWithAuthContext isolates concurrent contexts from each other', async () => {
  const [tokenA, tokenB] = await Promise.all([
    runWithAuthContext({ token: 'a' }, async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return getAuthContext().token;
    }),
    runWithAuthContext({ token: 'b' }, async () => {
      return getAuthContext().token;
    }),
  ]);

  assert.equal(tokenA, 'a');
  assert.equal(tokenB, 'b');
});

test('getAuthContext returns undefined again after runWithAuthContext resolves', async () => {
  await runWithAuthContext({ token: 'x' }, async () => {
    assert.equal(getAuthContext().token, 'x');
  });

  assert.equal(getAuthContext(), undefined);
});
