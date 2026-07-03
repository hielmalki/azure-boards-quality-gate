import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/functions/fix-suggestions.js';
import { fakeRequest, fakeContext } from './helpers/http-test-utils.js';

const {
  generateWorkItemFixSuggestionHandler,
  generateWorkItemBatchFixSuggestionsHandler,
  startWorkItemFixSuggestionStreamHandler,
  getWorkItemFixSuggestionStreamResultHandler,
  assistWorkItemAnalysisWithLlmHandler,
  generateWorkItemSuggestionWithLlmHandler,
  reviseWorkItemSuggestionWithLlmHandler,
} = __testUtils;

test('every fix-suggestions handler returns 401 without an Authorization header', async () => {
  const handlers = [
    generateWorkItemFixSuggestionHandler,
    generateWorkItemBatchFixSuggestionsHandler,
    startWorkItemFixSuggestionStreamHandler,
    getWorkItemFixSuggestionStreamResultHandler,
    assistWorkItemAnalysisWithLlmHandler,
    generateWorkItemSuggestionWithLlmHandler,
    reviseWorkItemSuggestionWithLlmHandler,
  ];

  for (const handler of handlers) {
    const response = await handler(
      fakeRequest({ token: null, params: { id: '42', runId: 'run-1' } }),
      fakeContext()
    );
    assert.equal(response.status, 401);
    assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
  }
});
