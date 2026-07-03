import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAiUsageService,
  normalizeUsage,
} from '../src/services/ai-usage-service-core.js';

test('getTokenUsage returns a zeroed total when no record exists yet', async () => {
  const service = createAiUsageService({
    getStoredAiUsageFn: async () => null,
    setStoredAiUsageFn: async () => {},
    getNowFn: () => new Date('2026-04-01T10:00:00.000Z'),
  });

  const result = await service.getTokenUsage({
    accountId: 'user-1',
    installationId: 'site-1',
  });

  assert.equal(result.inputTokens, 0);
  assert.equal(result.outputTokens, 0);
  assert.equal(result.totalTokens, 0);
});

test('recordUsage adds the request token usage to the cumulative total', async () => {
  let storedRecord = null;
  const service = createAiUsageService({
    getStoredAiUsageFn: async () => storedRecord,
    setStoredAiUsageFn: async (_accountId, record) => {
      storedRecord = record;
    },
    getNowFn: () => new Date('2026-04-01T10:05:00.000Z'),
  });

  const result = await service.recordUsage({
    accountId: 'user-1',
    installationId: 'site-1',
    usage: {
      input_tokens: 1800,
      output_tokens: 900,
      total_tokens: 2700,
    },
  });

  assert.equal(result.usage.inputTokens, 1800);
  assert.equal(result.usage.outputTokens, 900);
  assert.equal(result.usage.totalTokens, 2700);
  assert.equal(result.totals.inputTokens, 1800);
  assert.equal(result.totals.outputTokens, 900);
  assert.equal(result.totals.totalTokens, 2700);
  assert.equal(storedRecord.totalTokens, 2700);
});

test('recordUsage keeps accumulating across multiple calls and never resets', async () => {
  let storedRecord = null;
  const service = createAiUsageService({
    getStoredAiUsageFn: async () => storedRecord,
    setStoredAiUsageFn: async (_accountId, record) => {
      storedRecord = record;
    },
    getNowFn: () => new Date('2026-05-15T10:05:00.000Z'),
  });

  await service.recordUsage({
    accountId: 'user-1',
    installationId: 'site-1',
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  });
  const second = await service.recordUsage({
    accountId: 'user-1',
    installationId: 'site-1',
    usage: { input_tokens: 200, output_tokens: 25, total_tokens: 225 },
  });

  assert.equal(second.totals.inputTokens, 300);
  assert.equal(second.totals.outputTokens, 75);
  assert.equal(second.totals.totalTokens, 375);

  const view = await service.getTokenUsage({
    accountId: 'user-1',
    installationId: 'site-1',
  });
  assert.equal(view.totalTokens, 375);
});

test('recordUsage tolerates a missing usage object without throwing', async () => {
  let storedRecord = null;
  const service = createAiUsageService({
    getStoredAiUsageFn: async () => storedRecord,
    setStoredAiUsageFn: async (_accountId, record) => {
      storedRecord = record;
    },
  });

  const result = await service.recordUsage({
    accountId: 'user-1',
    installationId: 'site-1',
    usage: null,
  });

  assert.equal(result.totals.totalTokens, 0);
  assert.equal(storedRecord.totalTokens, 0);
});

test('normalizeUsage derives total from input + output when total is absent', () => {
  const normalized = normalizeUsage({ input_tokens: 120, output_tokens: 30 });
  assert.equal(normalized.inputTokens, 120);
  assert.equal(normalized.outputTokens, 30);
  assert.equal(normalized.totalTokens, 150);
});
