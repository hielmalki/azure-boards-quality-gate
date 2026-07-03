import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_APPLY_FIELDS,
  __testUtils,
  createAzureDevOpsApplyService,
} from '../src/services/azure-devops-apply-service-core.js';

function createCurrentIssue(overrides = {}) {
  return {
    key: '42',
    summary: 'Vorhandener Titel',
    description: 'Bestehende Beschreibung',
    acceptanceCriteria: null,
    ...overrides,
  };
}

test('ALLOWED_APPLY_FIELDS defines the supported Azure DevOps update targets', () => {
  assert.deepEqual(ALLOWED_APPLY_FIELDS, ['summary', 'description', 'acceptanceCriteria']);
});

test('applySingleSuggestion writes a summary update and stores an audit record', async () => {
  const updatedFields = [];
  const auditRecords = [];
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () => createCurrentIssue(),
    updateIssueFieldsFn: async (issueKey, fields) => {
      updatedFields.push({ issueKey, fields });
    },
    storeApplyAuditRecordFn: async (issueKey, auditId, record) => {
      auditRecords.push({ issueKey, auditId, record });
    },
  });

  const result = await service.applySingleSuggestion({
    issueKey: '42',
    suggestion: {
      findingId: 'title_missing',
      targetField: 'summary',
      currentText: 'Vorhandener Titel',
      suggestedText: 'Neuer präziser Titel',
    },
    accountId: 'user-1',
  });

  assert.equal(result.status, 'completed');
  assert.equal(updatedFields.length, 1);
  assert.deepEqual(updatedFields[0], {
    issueKey: '42',
    fields: {
      summary: 'Neuer präziser Titel',
    },
  });
  assert.equal(auditRecords.length, 1);
  assert.equal(auditRecords[0].record.status, 'completed');
});

test('applySingleSuggestion returns a conflict when the issue changed since analysis', async () => {
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () => createCurrentIssue({
      summary: 'Zwischenzeitlich geänderter Titel',
    }),
    updateIssueFieldsFn: async () => {
      throw new Error('should not be called');
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applySingleSuggestion({
    issueKey: '42',
    suggestion: {
      findingId: 'title_missing',
      targetField: 'summary',
      currentText: 'Vorhandener Titel',
      suggestedText: 'Neuer präziser Titel',
    },
    accountId: 'user-1',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'ISSUE_CONFLICT');
});

test('applyBatchSuggestions rejects duplicate target groups before writing the conflicting entry', async () => {
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () => createCurrentIssue(),
    updateIssueFieldsFn: async (_issueKey, fields) => {
      if (fields.summary === 'Fehlerhafter Titel') {
        throw new Error('Azure DevOps write failed');
      }
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applyBatchSuggestions({
    issueKey: '42',
    suggestions: [
      {
        findingId: 'title_missing',
        targetField: 'summary',
        currentText: 'Vorhandener Titel',
        suggestedText: 'Neuer Titel',
      },
      {
        findingId: 'title_missing',
        targetField: 'summary',
        currentText: 'Vorhandener Titel',
        suggestedText: 'Fehlerhafter Titel',
      },
    ],
    accountId: 'user-1',
  });

  assert.equal(result.summary.requested, 2);
  assert.equal(result.summary.succeeded, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.results[0].status, 'completed');
  assert.equal(result.results[1].status, 'failed');
  assert.equal(result.results[1].error.code, 'BATCH_TARGET_CONFLICT');
});

test('applyBatchSuggestions writes compatible summary and acceptance criteria changes in one Azure DevOps update', async () => {
  const updatedFields = [];
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () => createCurrentIssue(),
    updateIssueFieldsFn: async (_issueKey, fields) => {
      updatedFields.push(fields);
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applyBatchSuggestions({
    issueKey: '42',
    suggestions: [
      {
        findingId: 'title_missing',
        targetField: 'summary',
        currentText: 'Vorhandener Titel',
        suggestedText: 'Neuer Titel',
      },
      {
        findingId: 'acceptance_criteria_missing',
        targetField: 'acceptanceCriteria',
        currentText: 'Keine Akzeptanzkriterien definiert',
        suggestedText: '1. Erstes Kriterium\n2. Zweites Kriterium',
      },
    ],
    accountId: 'user-1',
  });

  assert.equal(result.summary.succeeded, 2);
  assert.equal(result.summary.failed, 0);
  assert.equal(updatedFields.length, 1);
  assert.equal(updatedFields[0].summary, 'Neuer Titel');
  assert.equal(updatedFields[0].description, undefined);
  assert.match(updatedFields[0].acceptanceCriteria, /<ol>/);
  assert.match(updatedFields[0].acceptanceCriteria, /Erstes Kriterium/);
  assert.match(updatedFields[0].acceptanceCriteria, /Zweites Kriterium/);
});

test('applyBatchSuggestions allows multiple description suggestions in one batch', async () => {
  const updatedFields = [];
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () => createCurrentIssue(),
    updateIssueFieldsFn: async (_issueKey, fields) => {
      updatedFields.push(fields);
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applyBatchSuggestions({
    issueKey: '42',
    suggestions: [
      {
        findingId: 'description_missing',
        targetField: 'description',
        currentText: 'Bestehende Beschreibung',
        suggestedText: 'Neue Beschreibung',
      },
      {
        findingId: 'description_present',
        targetField: 'description',
        currentText: 'Bestehende Beschreibung',
        suggestedText: 'Noch eine Beschreibung',
      },
    ],
    accountId: 'user-1',
  });

  assert.equal(updatedFields.length, 1);
  assert.equal(result.summary.succeeded, 2);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.results[0].status, 'completed');
  assert.equal(result.results[1].status, 'completed');
  assert.match(updatedFields[0].description, /Noch eine Beschreibung/);
});

test('applyBatchSuggestions writes description and acceptance criteria as independent fields without dropping either change', async () => {
  const updatedFields = [];
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () => createCurrentIssue(),
    updateIssueFieldsFn: async (_issueKey, fields) => {
      updatedFields.push(fields);
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applyBatchSuggestions({
    issueKey: '42',
    suggestions: [
      {
        findingId: 'user_value_unclear',
        targetField: 'description',
        currentText: 'Bestehende Beschreibung',
        suggestedText: 'Neue verbesserte Beschreibung mit klarem Nutzen',
      },
      {
        findingId: 'acceptance_criteria_missing',
        targetField: 'acceptanceCriteria',
        suggestedText: '1. Erstes Kriterium\n2. Zweites Kriterium',
      },
    ],
    accountId: 'user-1',
  });

  assert.equal(result.summary.requested, 2);
  assert.equal(result.summary.succeeded, 2);
  assert.equal(result.summary.failed, 0);
  assert.equal(result.results[0].status, 'completed');
  assert.equal(result.results[1].status, 'completed');
  assert.equal(updatedFields.length, 1);

  // Regression: description und AC sind eigene Felder und dürfen sich beim Zusammenführen
  // im selben Batch nicht gegenseitig überschreiben oder verlieren.
  assert.match(updatedFields[0].description, /Neue verbesserte Beschreibung mit klarem Nutzen/);
  assert.doesNotMatch(updatedFields[0].description, /Bestehende Beschreibung/);
  assert.match(updatedFields[0].acceptanceCriteria, /Erstes Kriterium/);
  assert.match(updatedFields[0].acceptanceCriteria, /Zweites Kriterium/);
});

test('applySingleSuggestion detects conflicts for acceptance criteria when criteria were added in the meantime', async () => {
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () =>
      createCurrentIssue({
        acceptanceCriteria: '1. Bereits vorhanden',
      }),
    updateIssueFieldsFn: async () => {
      throw new Error('should not be called');
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applySingleSuggestion({
    issueKey: '42',
    suggestion: {
      findingId: 'acceptance_criteria_missing',
      targetField: 'acceptanceCriteria',
      currentText: 'Keine Akzeptanzkriterien definiert',
      suggestedText: '1. Neues Kriterium',
    },
    accountId: 'user-1',
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'ISSUE_CONFLICT');
});

test('applySingleSuggestion writes acceptance criteria to its own native field as HTML', async () => {
  const updatedFields = [];
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () => createCurrentIssue(),
    updateIssueFieldsFn: async (_issueKey, fields) => {
      updatedFields.push(fields);
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applySingleSuggestion({
    issueKey: '42',
    suggestion: {
      findingId: 'acceptance_criteria_missing',
      targetField: 'acceptanceCriteria',
      currentText: 'Keine Akzeptanzkriterien definiert',
      suggestedText: '1. Erstes Kriterium\n2. Zweites Kriterium',
    },
    accountId: 'user-1',
  });

  assert.equal(result.status, 'completed');
  assert.equal(updatedFields.length, 1);
  assert.equal(updatedFields[0].description, undefined);
  assert.match(updatedFields[0].acceptanceCriteria, /<ol>/);
  assert.match(updatedFields[0].acceptanceCriteria, /<li>Erstes Kriterium<\/li>/);
  assert.match(updatedFields[0].acceptanceCriteria, /<li>Zweites Kriterium<\/li>/);
});

test('applySingleSuggestion preserves technical note and trailing content for description updates', async () => {
  const updatedFields = [];
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () =>
      createCurrentIssue({
        description: `Beschreibung:
Bestehende Einleitung

Technische Notiz:
Vorhandene Notiz

Akzeptanzkriterien:
1. Bereits vorhanden`,
      }),
    updateIssueFieldsFn: async (_issueKey, fields) => {
      updatedFields.push(fields);
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applySingleSuggestion({
    issueKey: '42',
    suggestion: {
      findingId: 'user_value_unclear',
      targetField: 'description',
      currentText: `Beschreibung:
Bestehende Einleitung

Technische Notiz:
Vorhandene Notiz

Akzeptanzkriterien:
1. Bereits vorhanden`,
      suggestedText: `Beschreibung:
Neue verbesserte Einleitung mit klarem Nutzen`,
    },
    accountId: 'user-1',
  });

  assert.equal(result.status, 'completed');
  assert.equal(updatedFields.length, 1);

  const description = updatedFields[0].description;
  assert.match(description, /Neue verbesserte Einleitung mit klarem Nutzen/);
  assert.match(description, /Technische Notiz:/);
  assert.match(description, /Vorhandene Notiz/);
});

test('applySingleSuggestion also preserves technical note for examples_missing description updates', async () => {
  const updatedFields = [];
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () =>
      createCurrentIssue({
        description: `Beschreibung:
Vorhandene Einleitung

Technische Notiz:
Vorhandene Notiz`,
      }),
    updateIssueFieldsFn: async (_issueKey, fields) => {
      updatedFields.push(fields);
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applySingleSuggestion({
    issueKey: '42',
    suggestion: {
      findingId: 'examples_missing',
      targetField: 'description',
      currentText: `Beschreibung:
Vorhandene Einleitung

Technische Notiz:
Vorhandene Notiz`,
      suggestedText: `Beschreibung:
Neue Beschreibung mit konkretem Beispiel:
- Wenn ein Nutzer das Kontingent aufbraucht, sieht er eine klare Fehlermeldung.`,
    },
    accountId: 'user-1',
  });

  assert.equal(result.status, 'completed');
  assert.equal(updatedFields.length, 1);

  const description = updatedFields[0].description;
  assert.match(description, /Neue Beschreibung mit konkretem Beispiel/);
  assert.match(description, /Technische Notiz:/);
  assert.match(description, /Vorhandene Notiz/);
});

test('buildHtmlDocument converts numbered acceptance criteria into a single ordered list block', () => {
  const html = __testUtils.buildHtmlDocument(`Akzeptanzkriterien:

1. Erstes Kriterium
2. Zweites Kriterium
3. Drittes Kriterium`);

  const orderedListMatches = html.match(/<ol>/g) ?? [];

  assert.equal(orderedListMatches.length, 1);
  assert.match(html, /<li>Erstes Kriterium<\/li>/);
  assert.match(html, /<li>Zweites Kriterium<\/li>/);
  assert.match(html, /<li>Drittes Kriterium<\/li>/);
});

test('buildHtmlDocument sanitizes disallowed tags out of the generated HTML', () => {
  const html = __testUtils.buildHtmlDocument('<script>alert(1)</script>Normaler Text');

  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Normaler Text/);
});

test('buildRevisedDescription preserves existing trailing sections when the suggestion only rewrites the main description', () => {
  const revisedDescription = __testUtils.buildRevisedDescription(
    `Beschreibung:
Alte Einleitung

Technische Notiz:
Vorhandene Notiz`,
    `Beschreibung:
Neue Einleitung`
  );

  assert.match(revisedDescription, /Neue Einleitung/);
  assert.match(revisedDescription, /Technische Notiz:/);
  assert.match(revisedDescription, /Vorhandene Notiz/);
});

test('applySingleSuggestion supports custom finding ids for description updates', async () => {
  const updatedFields = [];
  const service = createAzureDevOpsApplyService({
    getNormalizedIssueFn: async () =>
      createCurrentIssue({
        description: 'Bestehende Beschreibung',
      }),
    updateIssueFieldsFn: async (_issueKey, fields) => {
      updatedFields.push(fields);
    },
    storeApplyAuditRecordFn: async () => {},
  });

  const result = await service.applySingleSuggestion({
    issueKey: '42',
    suggestion: {
      findingId: 'custom_rule:custom-fixable-set:rule-sem-fixable',
      targetField: 'description',
      currentText: 'Bestehende Beschreibung',
      suggestedText: 'Neue Beschreibung mit klarem Nutzen.',
    },
    accountId: 'user-1',
  });

  assert.equal(result.status, 'completed');
  assert.equal(updatedFields.length, 1);
  assert.match(updatedFields[0].description, /Neue Beschreibung mit klarem Nutzen/);
});
