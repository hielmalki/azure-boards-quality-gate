import test from 'node:test';
import assert from 'node:assert/strict';
import { getStoredAiUsage, setStoredAiUsage } from '../src/repositories/ai-usage-repository.js';
import {
  getStoredIssueAnalysis,
  setStoredIssueAnalysis,
} from '../src/repositories/analysis-repository.js';
import {
  getStoredOpenAiApiKey,
  setStoredOpenAiApiKey,
} from '../src/repositories/app-config-repository.js';
import { storeApplyAuditRecord } from '../src/repositories/apply-audit-repository.js';
import {
  getFixSuggestionRun,
  setFixSuggestionRun,
} from '../src/repositories/fix-suggestion-run-repository.js';
import {
  getStoredActiveRulesets,
  setStoredActiveRulesets,
} from '../src/repositories/ruleset-repository.js';
import {
  getStoredUserState,
  setStoredUserState,
} from '../src/repositories/user-state-repository.js';

function createFakeTableClient() {
  const entities = new Map();

  return {
    async getEntity(partitionKey, rowKey) {
      const entity = entities.get(`${partitionKey}:${rowKey}`);
      if (!entity) {
        const error = new Error('Not Found');
        error.statusCode = 404;
        throw error;
      }
      return entity;
    },
    async upsertEntity(entity) {
      entities.set(`${entity.partitionKey}:${entity.rowKey}`, entity);
    },
    async deleteEntity(partitionKey, rowKey) {
      if (!entities.has(`${partitionKey}:${rowKey}`)) {
        const error = new Error('Not Found');
        error.statusCode = 404;
        throw error;
      }
      entities.delete(`${partitionKey}:${rowKey}`);
    },
  };
}

test('ai-usage-repository round-trips via the injected table client', async () => {
  const tableClient = createFakeTableClient();

  assert.equal(await getStoredAiUsage('acc-1', { tableClient }), null);
  await setStoredAiUsage('acc-1', { requests: 5 }, { tableClient });
  assert.deepEqual(await getStoredAiUsage('acc-1', { tableClient }), { requests: 5 });
});

test('analysis-repository round-trips and short-circuits without an issueKey', async () => {
  const tableClient = createFakeTableClient();

  assert.equal(await getStoredIssueAnalysis(null, { tableClient }), null);
  await setStoredIssueAnalysis(null, { score: 1 }, { tableClient });

  await setStoredIssueAnalysis('42', { score: 87 }, { tableClient });
  assert.deepEqual(await getStoredIssueAnalysis('42', { tableClient }), { score: 87 });
});

test('app-config-repository stores, reads back, and deletes the OpenAI key', async () => {
  const tableClient = createFakeTableClient();

  assert.equal(await getStoredOpenAiApiKey({ tableClient }), null);

  await setStoredOpenAiApiKey('  sk-test-123  ', { tableClient });
  assert.equal(await getStoredOpenAiApiKey({ tableClient }), 'sk-test-123');

  await setStoredOpenAiApiKey('', { tableClient });
  assert.equal(await getStoredOpenAiApiKey({ tableClient }), null);
});

test('apply-audit-repository stores a record and is a no-op without issueKey/auditId', async () => {
  const tableClient = createFakeTableClient();

  await storeApplyAuditRecord(null, 'audit-1', { status: 'completed' }, { tableClient });
  await storeApplyAuditRecord('42', null, { status: 'completed' }, { tableClient });

  await storeApplyAuditRecord('42', 'audit-1', { status: 'completed' }, { tableClient });
  const entity = await tableClient.getEntity('apply-audit', '42:audit-1');
  assert.deepEqual(JSON.parse(entity.value), { status: 'completed' });
});

test('fix-suggestion-run-repository round-trips a run record', async () => {
  const tableClient = createFakeTableClient();

  assert.equal(
    await getFixSuggestionRun({ issueKey: '42', findingId: 'title_missing', runId: 'r1' }, { tableClient }),
    null
  );

  await setFixSuggestionRun(
    { issueKey: '42', findingId: 'title_missing', runId: 'r1', record: { status: 'completed' } },
    { tableClient }
  );

  assert.deepEqual(
    await getFixSuggestionRun({ issueKey: '42', findingId: 'title_missing', runId: 'r1' }, { tableClient }),
    { status: 'completed' }
  );
});

test('ruleset-repository round-trips active ruleset ids', async () => {
  const tableClient = createFakeTableClient();

  assert.equal(await getStoredActiveRulesets({ tableClient }), null);
  await setStoredActiveRulesets(['basic-quality', 'ai-quality'], { tableClient });
  assert.deepEqual(await getStoredActiveRulesets({ tableClient }), ['basic-quality', 'ai-quality']);
});

test('user-state-repository round-trips per-account state', async () => {
  const tableClient = createFakeTableClient();

  assert.equal(await getStoredUserState('acc-1', { tableClient }), null);
  await setStoredUserState('acc-1', { onboardingSeen: true }, { tableClient });
  assert.deepEqual(await getStoredUserState('acc-1', { tableClient }), { onboardingSeen: true });
});
