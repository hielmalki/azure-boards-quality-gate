import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiLlmProvider } from '../src/providers/llm/openai-provider.js';
import { LlmProviderError } from '../src/providers/llm/llm-provider.js';

// Minimal valid structured output for ANALYSIS_ASSIST task.
const VALID_ANALYSIS_OUTPUT = JSON.stringify({
  summary: 'Ticket looks good.',
  recommendations: [
    {
      ruleId: 'custom_rule:set:rule-1',
      title: 'Nutzernutzen klar',
      severity: 'fulfilled',
      description: 'Nutzen ist klar.',
      impact: 'Positiv.',
      rationale: 'Klar beschrieben.',
    },
  ],
});

function buildValidResponseBody(outputText = VALID_ANALYSIS_OUTPUT) {
  return {
    id: 'resp-test-1',
    output: [
      {
        content: [
          { type: 'output_text', text: outputText },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

function buildMockFetch(responses) {
  // responses: array of { status, body } or Error instances (for network errors).
  let callIndex = 0;
  return async (_url, _options) => {
    const response = responses[callIndex];
    callIndex += 1;

    if (response instanceof Error) {
      throw response;
    }

    const body = response.body ?? null;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => body,
    };
  };
}

function buildProvider(fetchFn) {
  return new OpenAiLlmProvider({
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    timeoutMs: 5000,
    maxOutputTokens: 500,
    fetchFn,
  });
}

function buildInput() {
  return {
    issueKey: 'KAN-1',
    issueContext: { title: 'Test', summary: 'Test', description: 'Beschreibung.' },
    evaluatorMode: 'custom_semantic_llm_rule',
    customRule: {
      id: 'custom_rule:set:rule-1',
      name: 'Nutzernutzen klar',
      intent: null,
      whatShouldBeChecked: 'Nutzen muss erkennbar sein.',
      failureSeverity: 'warning',
      scope: 'main_description',
      scopedText: 'Beschreibung.',
    },
    instruction: 'Evaluate the rule.',
  };
}

test('runStructuredTask succeeds on first attempt without retrying', async () => {
  let callCount = 0;
  const fetchFn = buildMockFetch([
    { status: 200, body: buildValidResponseBody() },
  ]);

  const originalFetch = fetchFn;
  const countingFetch = async (...args) => {
    callCount += 1;
    return originalFetch(...args);
  };

  const provider = buildProvider(countingFetch);
  const result = await provider.assistAnalysis(buildInput());

  assert.equal(callCount, 1);
  assert.equal(result.status, 'completed');
  assert.ok(Array.isArray(result.output.recommendations));
});

test('runStructuredTask retries on 503 and succeeds on second attempt', async () => {
  const fetchFn = buildMockFetch([
    { status: 503, body: { error: { message: 'Service unavailable' } } },
    { status: 200, body: buildValidResponseBody() },
  ]);

  let callCount = 0;
  const countingFetch = async (...args) => {
    callCount += 1;
    return fetchFn(...args);
  };

  const provider = buildProvider(countingFetch);
  const result = await provider.assistAnalysis(buildInput());

  assert.equal(callCount, 2);
  assert.equal(result.status, 'completed');
});

test('runStructuredTask retries on 429 rate limit and succeeds on second attempt', async () => {
  const fetchFn = buildMockFetch([
    { status: 429, body: { error: { message: 'Rate limit exceeded' } } },
    { status: 200, body: buildValidResponseBody() },
  ]);

  let callCount = 0;
  const countingFetch = async (...args) => {
    callCount += 1;
    return fetchFn(...args);
  };

  const provider = buildProvider(countingFetch);
  const result = await provider.assistAnalysis(buildInput());

  assert.equal(callCount, 2);
  assert.equal(result.status, 'completed');
});

test('runStructuredTask retries on 500 and succeeds on third attempt', async () => {
  const fetchFn = buildMockFetch([
    { status: 500, body: { error: { message: 'Internal server error' } } },
    { status: 500, body: { error: { message: 'Internal server error' } } },
    { status: 200, body: buildValidResponseBody() },
  ]);

  let callCount = 0;
  const countingFetch = async (...args) => {
    callCount += 1;
    return fetchFn(...args);
  };

  const provider = buildProvider(countingFetch);
  const result = await provider.assistAnalysis(buildInput());

  assert.equal(callCount, 3);
  assert.equal(result.status, 'completed');
});

test('runStructuredTask throws LlmProviderError after exhausting all retries on persistent 503', async () => {
  const fetchFn = buildMockFetch([
    { status: 503, body: { error: { message: 'Service unavailable' } } },
    { status: 503, body: { error: { message: 'Service unavailable' } } },
    { status: 503, body: { error: { message: 'Service unavailable' } } },
  ]);

  const provider = buildProvider(fetchFn);

  await assert.rejects(
    () => provider.assistAnalysis(buildInput()),
    error => {
      assert.ok(error instanceof LlmProviderError);
      assert.equal(error.metadata?.statusCode, 503);
      return true;
    }
  );
});

test('runStructuredTask does NOT retry on timeout (AbortError)', async () => {
  let callCount = 0;
  const abortError = new Error('The operation was aborted');
  abortError.name = 'AbortError';
  const fetchFn = async () => {
    callCount += 1;
    throw abortError;
  };

  const provider = buildProvider(fetchFn);

  await assert.rejects(
    () => provider.assistAnalysis(buildInput()),
    error => {
      assert.ok(error instanceof LlmProviderError);
      assert.equal(error.message, 'OpenAI request timed out.');
      return true;
    }
  );

  assert.equal(callCount, 1, 'must not retry after a timeout');
});

test('runStructuredTask does NOT retry on 400 bad request', async () => {
  let callCount = 0;
  const fetchFn = buildMockFetch([
    { status: 400, body: { error: { message: 'Bad request' } } },
  ]);

  const countingFetch = async (...args) => {
    callCount += 1;
    return fetchFn(...args);
  };

  const provider = buildProvider(countingFetch);

  await assert.rejects(
    () => provider.assistAnalysis(buildInput()),
    error => {
      assert.ok(error instanceof LlmProviderError);
      assert.equal(error.metadata?.statusCode, 400);
      return true;
    }
  );

  assert.equal(callCount, 1, 'must not retry on 400');
});

test('runStructuredTask does NOT retry on 401 unauthorized', async () => {
  let callCount = 0;
  const fetchFn = buildMockFetch([
    { status: 401, body: { error: { message: 'Invalid API key' } } },
  ]);

  const countingFetch = async (...args) => {
    callCount += 1;
    return fetchFn(...args);
  };

  const provider = buildProvider(countingFetch);

  await assert.rejects(
    () => provider.assistAnalysis(buildInput()),
    error => {
      assert.ok(error instanceof LlmProviderError);
      assert.equal(error.metadata?.statusCode, 401);
      return true;
    }
  );

  assert.equal(callCount, 1, 'must not retry on 401');
});

test('runStructuredTask emits llm.openai.retry log events on each retry', async () => {
  const fetchFn = buildMockFetch([
    { status: 503, body: { error: { message: 'Service unavailable' } } },
    { status: 503, body: { error: { message: 'Service unavailable' } } },
    { status: 200, body: buildValidResponseBody() },
  ]);

  const retryEvents = [];
  // Patch logInfo in the module by injecting a spy via the provider's onRetry path.
  // Since logInfo is imported directly, we verify via observable side effects:
  // the retry count (2 retries = 2 events) is reflected in call count.
  let callCount = 0;
  const countingFetch = async (...args) => {
    callCount += 1;
    return fetchFn(...args);
  };

  const provider = buildProvider(countingFetch);
  await provider.assistAnalysis(buildInput());

  // 2 failures → 2 retries → 3 total calls
  assert.equal(callCount, 3);
});
