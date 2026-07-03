import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitStorageKey,
  getValue,
  setValue,
  deleteValue,
} from '../src/repositories/table-kv-store.js';

function createFakeTableClient({ entities = new Map() } = {}) {
  const calls = { getEntity: [], upsertEntity: [], deleteEntity: [] };

  const notFoundError = () => {
    const error = new Error('Not Found');
    error.statusCode = 404;
    return error;
  };

  const tableClient = {
    async getEntity(partitionKey, rowKey) {
      calls.getEntity.push({ partitionKey, rowKey });
      const entity = entities.get(`${partitionKey}:${rowKey}`);
      if (!entity) {
        throw notFoundError();
      }
      return entity;
    },
    async upsertEntity(entity) {
      calls.upsertEntity.push(entity);
      entities.set(`${entity.partitionKey}:${entity.rowKey}`, entity);
    },
    async deleteEntity(partitionKey, rowKey) {
      calls.deleteEntity.push({ partitionKey, rowKey });
      if (!entities.has(`${partitionKey}:${rowKey}`)) {
        throw notFoundError();
      }
      entities.delete(`${partitionKey}:${rowKey}`);
    },
  };

  return { tableClient, entities, calls };
}

test('splitStorageKey splits on the first colon into partitionKey/rowKey', () => {
  assert.deepEqual(splitStorageKey('analysis:42'), { partitionKey: 'analysis', rowKey: '42' });
  assert.deepEqual(splitStorageKey('rulesets:active'), {
    partitionKey: 'rulesets',
    rowKey: 'active',
  });
});

test('splitStorageKey keeps embedded colons in the rowKey (e.g. custom-rule finding ids)', () => {
  assert.deepEqual(
    splitStorageKey('fix-suggestion-run:42:custom_rule:custom-fixable-set:rule-sem-fixable:abc123'),
    {
      partitionKey: 'fix-suggestion-run',
      rowKey: '42:custom_rule:custom-fixable-set:rule-sem-fixable:abc123',
    }
  );
});

test('splitStorageKey falls back to a fixed rowKey when there is no colon', () => {
  assert.deepEqual(splitStorageKey('nodelimiter'), { partitionKey: 'nodelimiter', rowKey: '_' });
});

test('getValue returns null when the entity does not exist', async () => {
  const { tableClient } = createFakeTableClient();

  const result = await getValue('analysis:42', { tableClient });

  assert.equal(result, null);
});

test('setValue then getValue round-trips a JSON-serializable value', async () => {
  const { tableClient } = createFakeTableClient();

  await setValue('analysis:42', { score: 87, findings: ['a', 'b'] }, { tableClient });
  const result = await getValue('analysis:42', { tableClient });

  assert.deepEqual(result, { score: 87, findings: ['a', 'b'] });
});

test('setValue stores the value as a JSON string under the split partition/row key', async () => {
  const { tableClient, calls } = createFakeTableClient();

  await setValue('rulesets:active', ['basic-quality', 'ai-quality'], { tableClient });

  assert.equal(calls.upsertEntity.length, 1);
  assert.equal(calls.upsertEntity[0].partitionKey, 'rulesets');
  assert.equal(calls.upsertEntity[0].rowKey, 'active');
  assert.equal(calls.upsertEntity[0].value, JSON.stringify(['basic-quality', 'ai-quality']));
});

test('deleteValue removes a stored entity and is a no-op when it does not exist', async () => {
  const { tableClient, entities } = createFakeTableClient();

  await setValue('app-config:openai-api-key', 'sk-test', { tableClient });
  assert.equal(entities.size, 1);

  await deleteValue('app-config:openai-api-key', { tableClient });
  assert.equal(entities.size, 0);

  // Zweites Löschen desselben (nicht mehr vorhandenen) Keys darf nicht werfen.
  await deleteValue('app-config:openai-api-key', { tableClient });
});

test('getValue propagates unexpected errors instead of swallowing them', async () => {
  const tableClient = {
    async getEntity() {
      throw new Error('service unavailable');
    },
  };

  await assert.rejects(() => getValue('analysis:42', { tableClient }), /service unavailable/);
});
