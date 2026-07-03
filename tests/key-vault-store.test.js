import test from 'node:test';
import assert from 'node:assert/strict';
import { toSecretName, getValue, setValue, deleteValue } from '../src/repositories/key-vault-store.js';

function createFakeSecretClient({ secrets = new Map() } = {}) {
  const calls = { getSecret: [], setSecret: [], beginDeleteSecret: [] };

  const notFoundError = () => {
    const error = new Error('SecretNotFound');
    error.statusCode = 404;
    error.code = 'SecretNotFound';
    return error;
  };

  const secretClient = {
    async getSecret(name) {
      calls.getSecret.push(name);
      if (!secrets.has(name)) {
        throw notFoundError();
      }
      return { value: secrets.get(name) };
    },
    async setSecret(name, value) {
      calls.setSecret.push({ name, value });
      secrets.set(name, value);
    },
    async beginDeleteSecret(name) {
      calls.beginDeleteSecret.push(name);
      if (!secrets.has(name)) {
        throw notFoundError();
      }
      secrets.delete(name);
      return { pollUntilDone: async () => {} };
    },
  };

  return { secretClient, secrets, calls };
}

test('toSecretName maps internal colon-separated keys to valid Key Vault secret names', () => {
  assert.equal(toSecretName('app-config:openai-api-key'), 'app-config-openai-api-key');
  assert.equal(toSecretName('openai-api-key'), 'openai-api-key');
});

test('getValue returns null when the secret does not exist', async () => {
  const { secretClient } = createFakeSecretClient();

  assert.equal(await getValue('openai-api-key', { secretClient }), null);
});

test('setValue then getValue round-trips a secret value', async () => {
  const { secretClient } = createFakeSecretClient();

  await setValue('openai-api-key', 'sk-test-123', { secretClient });

  assert.equal(await getValue('openai-api-key', { secretClient }), 'sk-test-123');
});

test('setValue stores the raw string value under the mapped secret name', async () => {
  const { secretClient, calls } = createFakeSecretClient();

  await setValue('app-config:openai-api-key', 'sk-test-123', { secretClient });

  assert.equal(calls.setSecret.length, 1);
  assert.equal(calls.setSecret[0].name, 'app-config-openai-api-key');
  assert.equal(calls.setSecret[0].value, 'sk-test-123');
});

test('deleteValue removes a stored secret and is a no-op when it does not exist', async () => {
  const { secretClient, secrets } = createFakeSecretClient();

  await setValue('openai-api-key', 'sk-test', { secretClient });
  assert.equal(secrets.size, 1);

  await deleteValue('openai-api-key', { secretClient });
  assert.equal(secrets.size, 0);

  // Zweites Löschen desselben (nicht mehr vorhandenen) Secrets darf nicht werfen.
  await deleteValue('openai-api-key', { secretClient });
});

test('getValue propagates unexpected errors instead of swallowing them', async () => {
  const secretClient = {
    async getSecret() {
      throw new Error('service unavailable');
    },
  };

  await assert.rejects(() => getValue('openai-api-key', { secretClient }), /service unavailable/);
});
