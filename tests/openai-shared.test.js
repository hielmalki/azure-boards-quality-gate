import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTaskUserPrompt,
  buildStructuredOutputSchema,
  validateTaskOutput,
} from '../src/providers/llm/openai-shared.js';
import { LLM_TASKS } from '../src/providers/llm/llm-tasks.js';

test('buildTaskUserPrompt includes existing test cases and the direction instruction as data', () => {
  const prompt = buildTaskUserPrompt(LLM_TASKS.GENERATE_TEST_CASES, {
    issueKey: 'KAN-41',
    issueContext: {
      title: 'Kontingent verwalten',
      description: 'Als Nutzer möchte ich mein Kontingent einsehen können.',
      acceptanceCriteria: '1. Kontingent wird korrekt angezeigt',
    },
    existingTestCases: [{ title: 'Kontingent korrekt anzeigen', steps: [] }],
    instruction: 'Negativ- und Randfälle',
  });

  assert.match(prompt, /Erzeuge keine Duplikate davon/);
  assert.match(prompt, /Gewünschte Richtung für neue Testfälle.*Negativ- und Randfälle/);
  assert.match(prompt, /"existingTestCases"/);
  assert.match(prompt, /Kontingent korrekt anzeigen/);
});

test('buildTaskUserPrompt omits the existing-test-cases and direction hints when absent', () => {
  const prompt = buildTaskUserPrompt(LLM_TASKS.GENERATE_TEST_CASES, {
    issueKey: 'KAN-41',
    issueContext: { title: 'Kontingent verwalten' },
  });

  assert.doesNotMatch(prompt, /Erzeuge keine Duplikate davon/);
  assert.doesNotMatch(prompt, /Gewünschte Richtung für neue Testfälle/);
  assert.doesNotMatch(prompt, /Gewünschte Testfall-Verteilung/);
});

test('buildTaskUserPrompt includes the requested test-case distribution and step count', () => {
  const prompt = buildTaskUserPrompt(LLM_TASKS.GENERATE_TEST_CASES, {
    issueKey: 'KAN-41',
    issueContext: { title: 'Kontingent verwalten' },
    generationConfig: {
      types: [
        { key: 'happyPath', label: 'Happy Path (Erfolgsfälle)', count: 2 },
        { key: 'negative', label: 'Negativfälle (Fehler-/Ausnahmeverhalten)', count: 3 },
      ],
      total: 5,
      stepsPerCase: 4,
    },
  });

  assert.match(prompt, /Gewünschte Testfall-Verteilung/);
  assert.match(prompt, /2× Happy Path/);
  assert.match(prompt, /3× Negativfälle/);
  assert.match(prompt, /insgesamt ca\. 5/);
  assert.match(prompt, /Schritte pro Testfall: ca\. 4/);
});

test('buildTaskUserPrompt (GENERATE_TEST_STEPS) includes existing steps and uses step-specific direction wording', () => {
  const prompt = buildTaskUserPrompt(LLM_TASKS.GENERATE_TEST_STEPS, {
    issueKey: 'KAN-41',
    issueContext: { title: 'Kontingent verwalten' },
    testCaseTitle: 'Login mit gültigen Daten',
    existingSteps: [{ action: 'Login ausführen', expected: 'Dashboard erscheint' }],
    instruction: 'nur Fehlerfälle',
  });

  assert.match(prompt, /Bereits vorhandene Schritte für den Testfall "Login mit gültigen Daten"/);
  assert.match(prompt, /Erzeuge NUR zusätzliche neue Schritte/);
  assert.match(prompt, /Gewünschte Richtung für neue Schritte.*nur Fehlerfälle/);
  assert.doesNotMatch(prompt, /Gewünschte Richtung für neue Testfälle/);
  assert.match(prompt, /"existingSteps"/);
});

test('buildTaskUserPrompt (GENERATE_TEST_STEPS) omits the existing-steps hint when there are none', () => {
  const prompt = buildTaskUserPrompt(LLM_TASKS.GENERATE_TEST_STEPS, {
    issueKey: 'KAN-41',
    issueContext: { title: 'Kontingent verwalten' },
    testCaseTitle: 'Neuer Testfall',
    existingSteps: [],
  });

  assert.doesNotMatch(prompt, /Erzeuge NUR zusätzliche neue Schritte/);
});

test('buildStructuredOutputSchema (GENERATE_TEST_STEPS) requires action/expected per step', () => {
  const schema = buildStructuredOutputSchema(LLM_TASKS.GENERATE_TEST_STEPS);

  assert.equal(schema.name, 'test_steps_result');
  assert.deepEqual(schema.schema.required, ['steps']);
  assert.deepEqual(schema.schema.properties.steps.items.required, ['action', 'expected']);
});

test('validateTaskOutput (GENERATE_TEST_STEPS) accepts a valid (including empty) steps array', () => {
  const validWithSteps = validateTaskOutput(LLM_TASKS.GENERATE_TEST_STEPS, {
    steps: [{ action: 'Falsches Passwort eingeben', expected: 'Fehlermeldung erscheint' }],
  });
  assert.equal(validWithSteps.steps.length, 1);

  const validEmpty = validateTaskOutput(LLM_TASKS.GENERATE_TEST_STEPS, { steps: [] });
  assert.deepEqual(validEmpty.steps, []);
});

test('validateTaskOutput (GENERATE_TEST_STEPS) rejects a malformed steps shape', () => {
  assert.throws(() =>
    validateTaskOutput(LLM_TASKS.GENERATE_TEST_STEPS, { steps: [{ action: 'nur Aktion' }] })
  );
  assert.throws(() => validateTaskOutput(LLM_TASKS.GENERATE_TEST_STEPS, { steps: 'not-an-array' }));
});
