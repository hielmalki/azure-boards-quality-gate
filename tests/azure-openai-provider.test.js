import test from 'node:test';
import assert from 'node:assert/strict';
import { AzureOpenAiLlmProvider } from '../src/providers/llm/azure-openai-provider.js';
import { LlmProviderError } from '../src/providers/llm/llm-provider.js';

function buildProvider({ fetchFn, getAccessToken = async () => 'test-access-token' } = {}) {
  return new AzureOpenAiLlmProvider({
    endpoint: 'https://qualitygate-eu.openai.azure.com',
    deployment: 'gpt-4o-mini',
    apiVersion: '2024-08-01-preview',
    timeoutMs: 5000,
    maxOutputTokens: 500,
    getAccessToken,
    fetchFn,
  });
}

function buildTestCasesInput() {
  return {
    issueKey: 'KAN-1',
    issueContext: {
      title: 'Kontingent verwalten',
      description: 'Als Nutzer möchte ich mein Kontingent einsehen.',
      acceptanceCriteria: '1. Kontingent wird angezeigt',
    },
  };
}

test('constructor throws without endpoint/deployment/apiVersion', () => {
  assert.throws(
    () =>
      new AzureOpenAiLlmProvider({
        endpoint: '',
        deployment: '',
        apiVersion: '',
        timeoutMs: 5000,
        maxOutputTokens: 500,
        getAccessToken: async () => 'token',
      }),
    LlmProviderError
  );
});

test('constructor throws without an access token provider', () => {
  assert.throws(
    () =>
      new AzureOpenAiLlmProvider({
        endpoint: 'https://example.openai.azure.com',
        deployment: 'gpt-4o-mini',
        apiVersion: '2024-08-01-preview',
        timeoutMs: 5000,
        maxOutputTokens: 500,
      }),
    LlmProviderError
  );
});

test('generateTestCases sends a chat-completions request with a bearer token and parses the JSON result', async () => {
  let capturedUrl;
  let capturedInit;

  const fetchFn = async (url, init) => {
    capturedUrl = url.toString();
    capturedInit = init;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-1',
        choices: [
          {
            message: {
              content: JSON.stringify({
                testCases: [
                  {
                    title: 'Kontingent korrekt anzeigen',
                    preconditions: '',
                    steps: [{ action: 'Seite öffnen', expected: 'Kontingent wird angezeigt' }],
                    priority: 2,
                    derivedFrom: 'AK-1',
                  },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
      }),
    };
  };

  const provider = buildProvider({ fetchFn });
  const result = await provider.generateTestCases(buildTestCasesInput());

  assert.match(capturedUrl, /\/openai\/deployments\/gpt-4o-mini\/chat\/completions/);
  assert.match(capturedUrl, /api-version=2024-08-01-preview/);
  assert.equal(capturedInit.headers.Authorization, 'Bearer test-access-token');

  assert.equal(result.status, 'completed');
  assert.equal(result.provider, 'azure-openai');
  assert.equal(result.output.testCases.length, 1);
  assert.equal(result.output.testCases[0].title, 'Kontingent korrekt anzeigen');
  assert.equal(result.metadata.usage.total_tokens, 160);
});

test('generateTestCases throws a descriptive error on a non-ok response', async () => {
  const fetchFn = async () => ({
    ok: false,
    status: 500,
    json: async () => ({ error: { message: 'internal error' } }),
  });

  const provider = buildProvider({ fetchFn });

  await assert.rejects(
    () => provider.generateTestCases(buildTestCasesInput()),
    error => {
      assert.ok(error instanceof LlmProviderError);
      assert.equal(error.metadata.statusCode, 500);
      return true;
    }
  );
});

test('generateTestCases throws when the model output is not valid JSON', async () => {
  const fetchFn = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 'chatcmpl-2',
      choices: [{ message: { content: 'not valid json' } }],
      usage: {},
    }),
  });

  const provider = buildProvider({ fetchFn });

  await assert.rejects(() => provider.generateTestCases(buildTestCasesInput()), LlmProviderError);
});
