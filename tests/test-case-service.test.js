import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __testUtils,
  createTestCaseService,
} from '../src/services/test-case-service-core.js';

const {
  buildStepsXml,
  buildTestCasesPayload,
  mapTestCasesResult,
  normalizeGenerationConfig,
  buildTestStepsPayload,
  mapTestStepsResult,
} = __testUtils;

function createNormalizedIssue(overrides = {}) {
  return {
    key: 'KAN-41',
    summary: 'Kontingent verwalten',
    description: 'Als Nutzer möchte ich mein Kontingent einsehen können.',
    acceptanceCriteria: '1. Kontingent wird korrekt angezeigt\n2. Fehlerfall wird abgefangen',
    issueType: { name: 'Story' },
    ...overrides,
  };
}

function createLlmResult(testCases) {
  return {
    provider: 'openai',
    model: 'gpt-4o-mini',
    output: { testCases },
  };
}

test('buildStepsXml escapes step content and sets the step count', () => {
  const xml = buildStepsXml([
    { action: 'Eingabe <script> & "Test"', expected: 'Ergebnis > erwartet' },
    { action: 'Zweiter Schritt', expected: 'Zweites Ergebnis' },
  ]);

  assert.match(xml, /<steps id="0" last="2">/);
  assert.match(xml, /&lt;script&gt;/);
  assert.match(xml, /&amp;/);
  assert.match(xml, /Ergebnis &gt; erwartet/);
  assert.equal((xml.match(/<step /g) ?? []).length, 2);
});

test('buildStepsXml falls back to a single empty step when no steps are given', () => {
  const xml = buildStepsXml([]);
  assert.match(xml, /<steps id="0" last="1">/);
  assert.equal((xml.match(/<step /g) ?? []).length, 1);
});

test('buildTestCasesPayload includes description and acceptance criteria', () => {
  const issue = createNormalizedIssue();
  const payload = buildTestCasesPayload({ issueKey: issue.key, issue });

  assert.equal(payload.issueKey, 'KAN-41');
  assert.equal(payload.issueContext.acceptanceCriteria, issue.acceptanceCriteria);
  assert.equal(payload.issueContext.description, issue.description);
});

test('normalizeGenerationConfig keeps enabled types, clamps counts, and computes the total', () => {
  const normalized = normalizeGenerationConfig({
    types: {
      happyPath: { enabled: true, count: 2 },
      negative: { enabled: true, count: 99 }, // clamped to 10
      edge: { enabled: false, count: 5 }, // dropped
    },
    stepsPerCase: 4,
  });

  assert.equal(normalized.types.length, 2);
  assert.deepEqual(normalized.types.map(type => type.key), ['happyPath', 'negative']);
  assert.equal(normalized.types[0].count, 2);
  assert.equal(normalized.types[1].count, 10); // 99 clamped to per-type max 10 (remaining cap 13 not binding)
  assert.equal(normalized.total, 12);
  assert.equal(normalized.stepsPerCase, 4);
});

test('normalizeGenerationConfig returns null when no type is enabled or config is absent', () => {
  assert.equal(normalizeGenerationConfig(null), null);
  assert.equal(
    normalizeGenerationConfig({ types: { happyPath: { enabled: false, count: 3 } } }),
    null
  );
});

test('normalizeGenerationConfig enforces the overall total cap across types', () => {
  const normalized = normalizeGenerationConfig({
    types: {
      happyPath: { enabled: true, count: 10 },
      negative: { enabled: true, count: 10 },
      edge: { enabled: true, count: 10 },
    },
    stepsPerCase: 20, // clamped to 10
  });

  assert.equal(normalized.total, 15);
  assert.equal(normalized.stepsPerCase, 10);
});

test('mapTestCasesResult normalizes priority and trims fields', () => {
  const mapped = mapTestCasesResult({
    llmResult: createLlmResult([
      {
        title: '  Login mit gültigen Daten  ',
        preconditions: 'Nutzer ist registriert',
        steps: [{ action: 'Login ausführen', expected: 'Dashboard erscheint' }],
        priority: 99,
        derivedFrom: 'AK-1',
        type: 'happyPath',
      },
    ]),
  });

  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].title, 'Login mit gültigen Daten');
  assert.equal(mapped[0].priority, 2); // out-of-range priority falls back to default
  assert.equal(mapped[0].derivedFrom, 'AK-1');
  assert.equal(mapped[0].type, 'happyPath');
});

test('mapTestCasesResult falls back to null for a missing or unknown type', () => {
  const mapped = mapTestCasesResult({
    llmResult: createLlmResult([
      { title: 'Ohne Typ', steps: [{ action: 'a', expected: 'b' }], type: 'unknown-type' },
      { title: 'Auch ohne Typ', steps: [{ action: 'a', expected: 'b' }] },
    ]),
  });

  assert.equal(mapped[0].type, null);
  assert.equal(mapped[1].type, null);
});

test('mapTestCasesResult returns an empty list when the LLM output has no testCases', () => {
  const mapped = mapTestCasesResult({ llmResult: { output: {} } });
  assert.deepEqual(mapped, []);
});

test('buildTestStepsPayload carries the test case title, existing steps, and trimmed instruction', () => {
  const issue = createNormalizedIssue();
  const payload = buildTestStepsPayload({
    issueKey: issue.key,
    issue,
    testCaseTitle: 'Login mit gültigen Daten',
    existingSteps: [{ action: 'Login ausführen', expected: 'Dashboard erscheint' }],
    instruction: '  nur Fehlerfälle  ',
  });

  assert.equal(payload.issueKey, 'KAN-41');
  assert.equal(payload.testCaseTitle, 'Login mit gültigen Daten');
  assert.deepEqual(payload.existingSteps, [{ action: 'Login ausführen', expected: 'Dashboard erscheint' }]);
  assert.equal(payload.instruction, 'nur Fehlerfälle');
});

test('buildTestStepsPayload defaults existingSteps to [] and instruction to null when absent', () => {
  const issue = createNormalizedIssue();
  const payload = buildTestStepsPayload({ issueKey: issue.key, issue });

  assert.deepEqual(payload.existingSteps, []);
  assert.equal(payload.instruction, null);
});

test('mapTestStepsResult trims fields and drops fully-empty steps', () => {
  const mapped = mapTestStepsResult({
    llmResult: {
      output: {
        steps: [
          { action: '  Ungültiges Passwort eingeben  ', expected: '  Fehlermeldung erscheint  ' },
          { action: '', expected: '' },
        ],
      },
    },
  });

  assert.deepEqual(mapped, [
    { action: 'Ungültiges Passwort eingeben', expected: 'Fehlermeldung erscheint' },
  ]);
});

test('mapTestStepsResult returns an empty list when the LLM output has no steps', () => {
  assert.deepEqual(mapTestStepsResult({ llmResult: { output: {} } }), []);
});

test('generateTestCases loads the normalized issue and returns mapped test cases', async () => {
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async payload => {
      assert.equal(payload.issueKey, 'KAN-41');
      return createLlmResult([
        {
          title: 'Kontingent korrekt anzeigen',
          preconditions: '',
          steps: [{ action: 'Seite öffnen', expected: 'Kontingent wird angezeigt' }],
          priority: 1,
          derivedFrom: 'AK-1',
        },
      ]);
    },
    createTestCaseWorkItemFn: async () => {
      throw new Error('should not be called during generation');
    },
  });

  const result = await service.generateTestCases({ issueKey: 'KAN-41' });

  assert.equal(result.issueKey, 'KAN-41');
  assert.equal(result.testCases.length, 1);
  assert.equal(result.testCases[0].title, 'Kontingent korrekt anzeigen');
  assert.equal(result.existingCount, 0);
});

test('generateTestCases passes existing linked test cases and the instruction to the LLM payload', async () => {
  let capturedPayload = null;
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async payload => {
      capturedPayload = payload;
      return createLlmResult([]);
    },
    createTestCaseWorkItemFn: async () => {
      throw new Error('should not be called during generation');
    },
    fetchLinkedTestCasesFn: async ({ workItemId }) => {
      assert.equal(workItemId, 'KAN-41');
      return [
        { id: 'TC-1', title: 'Bestehender Testfall', state: 'Design', steps: [] },
      ];
    },
  });

  const result = await service.generateTestCases({
    issueKey: 'KAN-41',
    instruction: 'Negativ- und Randfälle',
  });

  assert.equal(result.existingCount, 1);
  assert.deepEqual(capturedPayload.existingTestCases, [
    { title: 'Bestehender Testfall', steps: [] },
  ]);
  assert.equal(capturedPayload.instruction, 'Negativ- und Randfälle');
});

test('generateTestCases passes the normalized generation config to the LLM payload', async () => {
  let capturedPayload = null;
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async payload => {
      capturedPayload = payload;
      return createLlmResult([]);
    },
    createTestCaseWorkItemFn: async () => {
      throw new Error('should not be called during generation');
    },
    fetchLinkedTestCasesFn: async () => [],
  });

  await service.generateTestCases({
    issueKey: 'KAN-41',
    config: {
      types: {
        happyPath: { enabled: true, count: 2 },
        negative: { enabled: true, count: 3 },
        edge: { enabled: false, count: 1 },
      },
      stepsPerCase: 5,
    },
  });

  assert.ok(capturedPayload.generationConfig);
  assert.equal(capturedPayload.generationConfig.total, 5);
  assert.equal(capturedPayload.generationConfig.stepsPerCase, 5);
  assert.deepEqual(
    capturedPayload.generationConfig.types.map(type => type.key),
    ['happyPath', 'negative']
  );
});

test('generateTestCases continues without existing-test-case context when the ADO lookup fails', async () => {
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async payload => {
      assert.deepEqual(payload.existingTestCases, []);
      return createLlmResult([]);
    },
    createTestCaseWorkItemFn: async () => {
      throw new Error('should not be called during generation');
    },
    fetchLinkedTestCasesFn: async () => {
      throw new Error('ADO relations request failed');
    },
  });

  const result = await service.generateTestCases({ issueKey: 'KAN-41' });

  assert.equal(result.existingCount, 0);
});

test('listExistingTestCases returns the linked test cases including their steps (for Weg-B prefill)', async () => {
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async () => {
      throw new Error('should not be called');
    },
    createTestCaseWorkItemFn: async () => {
      throw new Error('should not be called');
    },
    fetchLinkedTestCasesFn: async () => [
      { id: 'TC-1', title: 'Testfall A', state: 'Design', steps: [{ action: 'a', expected: 'b' }] },
    ],
  });

  const result = await service.listExistingTestCases({ issueKey: 'KAN-41' });

  assert.equal(result.issueKey, 'KAN-41');
  assert.equal(result.count, 1);
  assert.deepEqual(result.existingTestCases, [
    { id: 'TC-1', title: 'Testfall A', state: 'Design', steps: [{ action: 'a', expected: 'b' }] },
  ]);
});

test('listExistingTestCases defaults steps to an empty array when the gateway omits them', async () => {
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async () => {
      throw new Error('should not be called');
    },
    createTestCaseWorkItemFn: async () => {
      throw new Error('should not be called');
    },
    fetchLinkedTestCasesFn: async () => [{ id: 'TC-2', title: 'Testfall B', state: 'Design' }],
  });

  const result = await service.listExistingTestCases({ issueKey: 'KAN-41' });

  assert.deepEqual(result.existingTestCases, [
    { id: 'TC-2', title: 'Testfall B', state: 'Design', steps: [] },
  ]);
});

test('generateStepsForExisting passes the test case context to the LLM and returns only new steps', async () => {
  let capturedPayload = null;
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async () => {
      throw new Error('should not be called');
    },
    createTestCaseWorkItemFn: async () => {
      throw new Error('should not be called');
    },
    fetchLinkedTestCasesFn: async () => {
      throw new Error('should not be called');
    },
    generateTestStepsWithLlmFn: async payload => {
      capturedPayload = payload;
      return {
        provider: 'openai',
        model: 'gpt-4o-mini',
        output: { steps: [{ action: 'Falsches Passwort eingeben', expected: 'Fehlermeldung erscheint' }] },
      };
    },
  });

  const result = await service.generateStepsForExisting({
    issueKey: 'KAN-41',
    testCaseId: 'TC-501',
    testCaseTitle: 'Login mit gültigen Daten',
    existingSteps: [{ action: 'Login ausführen', expected: 'Dashboard erscheint' }],
    instruction: 'nur Fehlerfälle',
  });

  assert.equal(capturedPayload.testCaseTitle, 'Login mit gültigen Daten');
  assert.deepEqual(capturedPayload.existingSteps, [
    { action: 'Login ausführen', expected: 'Dashboard erscheint' },
  ]);
  assert.equal(capturedPayload.instruction, 'nur Fehlerfälle');

  assert.equal(result.issueKey, 'KAN-41');
  assert.equal(result.testCaseId, 'TC-501');
  assert.deepEqual(result.newSteps, [
    { action: 'Falsches Passwort eingeben', expected: 'Fehlermeldung erscheint' },
  ]);
});

test('appendStepsToTestCase reads the current steps fresh, merges, and writes the full field', async () => {
  let writtenStepsXml = null;
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async () => {
      throw new Error('should not be called');
    },
    createTestCaseWorkItemFn: async () => {
      throw new Error('should not be called');
    },
    fetchLinkedTestCasesFn: async () => {
      throw new Error('should not be called');
    },
    fetchTestCaseStepsFn: async testCaseId => {
      assert.equal(testCaseId, 'TC-501');
      return {
        id: 'TC-501',
        title: 'Login mit gültigen Daten',
        steps: [{ action: 'Login ausführen', expected: 'Dashboard erscheint' }],
      };
    },
    updateTestCaseStepsFn: async (testCaseId, stepsXml) => {
      assert.equal(testCaseId, 'TC-501');
      writtenStepsXml = stepsXml;
    },
  });

  const result = await service.appendStepsToTestCase({
    testCaseId: 'TC-501',
    newSteps: [{ action: 'Falsches Passwort eingeben', expected: 'Fehlermeldung erscheint' }],
  });

  assert.equal(result.testCaseId, 'TC-501');
  assert.equal(result.stepCount, 2);
  assert.equal(result.status, 'completed');
  assert.match(writtenStepsXml, /Login ausführen/);
  assert.match(writtenStepsXml, /Falsches Passwort eingeben/);
  assert.match(writtenStepsXml, /<steps id="0" last="2">/);
});

test('createTestCaseWorkItems creates each test case and reports a summary', async () => {
  const createdTitles = [];
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async () => {
      throw new Error('should not be called during creation');
    },
    createTestCaseWorkItemFn: async ({ storyId, title, stepsXml }) => {
      createdTitles.push(title);
      assert.equal(storyId, 'KAN-41');
      assert.match(stepsXml, /<steps/);
      return { id: `TC-${createdTitles.length}` };
    },
  });

  const result = await service.createTestCaseWorkItems({
    issueKey: 'KAN-41',
    testCases: [
      { title: 'Testfall A', preconditions: '', steps: [{ action: 'a', expected: 'b' }], priority: 2 },
      { title: 'Testfall B', preconditions: '', steps: [{ action: 'c', expected: 'd' }], priority: 3 },
    ],
  });

  assert.deepEqual(createdTitles, ['Testfall A', 'Testfall B']);
  assert.equal(result.summary.requested, 2);
  assert.equal(result.summary.succeeded, 2);
  assert.equal(result.summary.failed, 0);
});

test('createTestCaseWorkItems reports individual failures without failing the whole batch', async () => {
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async () => {
      throw new Error('should not be called during creation');
    },
    createTestCaseWorkItemFn: async ({ title }) => {
      if (title === 'Fehlschlag') {
        throw new Error('ADO request failed');
      }
      return { id: 'TC-1' };
    },
  });

  const result = await service.createTestCaseWorkItems({
    issueKey: 'KAN-41',
    testCases: [
      { title: 'Erfolg', preconditions: '', steps: [{ action: 'a', expected: 'b' }], priority: 2 },
      { title: 'Fehlschlag', preconditions: '', steps: [{ action: 'a', expected: 'b' }], priority: 2 },
    ],
  });

  assert.equal(result.summary.succeeded, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.results[1].error.code, 'TEST_CASE_CREATE_FAILED');
});

test('attachTestCasesToIssue merges the appendix into the current description', async () => {
  let updatedFields = null;
  const service = createTestCaseService({
    getNormalizedIssueFn: async () => createNormalizedIssue(),
    generateTestCasesWithLlmFn: async () => {
      throw new Error('should not be called');
    },
    createTestCaseWorkItemFn: async () => {
      throw new Error('should not be called');
    },
    updateIssueFieldsFn: async (issueKey, fields) => {
      assert.equal(issueKey, 'KAN-41');
      updatedFields = fields;
    },
  });

  const result = await service.attachTestCasesToIssue({
    issueKey: 'KAN-41',
    testCases: [
      { title: 'Testfall A', preconditions: 'Vorbedingung', steps: [{ action: 'a', expected: 'b' }], priority: 2 },
    ],
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.attachedCount, 1);
  assert.match(updatedFields.description, /Generierte Testfälle/);
  assert.match(updatedFields.description, /Testfall A/);
});
