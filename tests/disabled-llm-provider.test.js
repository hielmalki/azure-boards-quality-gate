import test from 'node:test';
import assert from 'node:assert/strict';
import { DisabledLlmProvider } from '../src/providers/llm/disabled-llm-provider.js';

test('generateSuggestionStream returns an unavailable result instead of throwing', async () => {
  const provider = new DisabledLlmProvider();

  const result = await provider.generateSuggestionStream({ issueKey: '42' }, {});

  assert.equal(result.status, 'unavailable');
  assert.equal(result.provider, 'disabled');
  assert.equal(result.task, 'generate_suggestion');
  assert.equal(result.output, null);
});

test('generateTestSteps returns an unavailable result instead of throwing', async () => {
  const provider = new DisabledLlmProvider();

  const result = await provider.generateTestSteps({ issueKey: '42', testCaseId: '501' });

  assert.equal(result.status, 'unavailable');
  assert.equal(result.provider, 'disabled');
  assert.equal(result.task, 'generate_test_steps');
  assert.equal(result.output, null);
});
