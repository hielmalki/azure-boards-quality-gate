import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getStoredOpenAiApiKey,
  setStoredOpenAiApiKey,
  isKeyVaultConfigured,
} from '../src/repositories/app-config-repository.js';

function createFakeSecretClient({ secrets = new Map() } = {}) {
  return {
    secrets,
    async getSecret(name) {
      if (!secrets.has(name)) {
        const error = new Error('SecretNotFound');
        error.statusCode = 404;
        error.code = 'SecretNotFound';
        throw error;
      }
      return { value: secrets.get(name) };
    },
    async setSecret(name, value) {
      secrets.set(name, value);
    },
    async beginDeleteSecret(name) {
      secrets.delete(name);
      return { pollUntilDone: async () => {} };
    },
  };
}

function withEnv(overrides, fn) {
  const originals = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    process.env[key] = overrides[key];
  }

  return (async () => fn())().finally(() => {
    for (const key of Object.keys(overrides)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  });
}

test('isKeyVaultConfigured reflects the AZURE_KEY_VAULT_URL environment variable', async () => {
  await withEnv({ AZURE_KEY_VAULT_URL: undefined }, () => {
    delete process.env.AZURE_KEY_VAULT_URL;
    assert.equal(isKeyVaultConfigured(), false);
  });

  await withEnv({ AZURE_KEY_VAULT_URL: 'https://example.vault.azure.net' }, () => {
    assert.equal(isKeyVaultConfigured(), true);
  });
});

test('getStoredOpenAiApiKey/setStoredOpenAiApiKey use Key Vault when AZURE_KEY_VAULT_URL is set', async () => {
  await withEnv({ AZURE_KEY_VAULT_URL: 'https://example.vault.azure.net' }, async () => {
    const secretClient = createFakeSecretClient();

    assert.equal(await getStoredOpenAiApiKey({ secretClient }), null);

    await setStoredOpenAiApiKey('  sk-vault-456  ', { secretClient });
    assert.equal(await getStoredOpenAiApiKey({ secretClient }), 'sk-vault-456');

    await setStoredOpenAiApiKey('', { secretClient });
    assert.equal(await getStoredOpenAiApiKey({ secretClient }), null);
  });
});

test('the OpenAI secret name is overridable via OPENAI_SECRET_NAME', async () => {
  await withEnv(
    { AZURE_KEY_VAULT_URL: 'https://example.vault.azure.net', OPENAI_SECRET_NAME: 'custom-openai-secret' },
    async () => {
      const secretClient = createFakeSecretClient({
        secrets: new Map([['custom-openai-secret', 'sk-custom']]),
      });

      assert.equal(await getStoredOpenAiApiKey({ secretClient }), 'sk-custom');
    }
  );
});

test('without AZURE_KEY_VAULT_URL, app-config-repository does not touch the secretClient', async () => {
  await withEnv({ AZURE_KEY_VAULT_URL: undefined }, async () => {
    delete process.env.AZURE_KEY_VAULT_URL;

    const tableClient = {
      async getEntity() {
        const error = new Error('Not Found');
        error.statusCode = 404;
        throw error;
      },
    };

    // Ein secretClient, der bei jedem Aufruf wirft, darf nicht erreicht werden,
    // solange kein Key Vault konfiguriert ist.
    const secretClient = {
      async getSecret() {
        throw new Error('should not be called');
      },
    };

    assert.equal(await getStoredOpenAiApiKey({ tableClient, secretClient }), null);
  });
});
