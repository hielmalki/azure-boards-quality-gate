import test from 'node:test';
import assert from 'node:assert/strict';
import { runRulesetAnalysis } from '../src/services/analysis-service.js';

function buildCustomRuleset(rule) {
  return [
    {
      id: 'custom-evaluator-test-set',
      name: 'Custom Evaluator Test Set',
      rules: [rule],
    },
  ];
}

function buildIssue(overrides = {}) {
  return {
    key: 'KAN-CUSTOM-1',
    summary: 'BE-12: UI Test failed',
    description: 'Die API-Endpunkte und Datenstrukturen werden implementiert.',
    priority: { name: 'Medium' },
    estimate: null,
    ...overrides,
  };
}

test('custom deterministic marker rule passes when marker exists in ticket text', () => {
  const result = runRulesetAnalysis(
    buildIssue({
      description: 'Beschreibung:\nAkzeptanzkriterien:\n1. Endpoint liefert Daten.',
    }),
    ['custom-evaluator-test-set'],
    buildCustomRuleset({
      id: 'rule-det-marker-pass',
      name: 'Marker vorhanden',
      checkDescription: 'Akzeptanzkriterien Ueberschrift muss vorkommen.',
      severity: 'critical',
      evaluatorType: 'deterministic',
      example: 'Akzeptanzkriterien:',
    })
  );

  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
  assert.equal(result.findings.critical.length, 0);
});

test('custom deterministic marker rule fails when marker is missing', () => {
  const result = runRulesetAnalysis(
    buildIssue({
      description: 'Beschreibung ohne die erwartete Marker-Passage.',
    }),
    ['custom-evaluator-test-set'],
    buildCustomRuleset({
      id: 'rule-det-marker-fail',
      name: 'Marker fehlt',
      checkDescription: 'Akzeptanzkriterien Ueberschrift muss vorkommen.',
      severity: 'critical',
      evaluatorType: 'deterministic',
      example: 'Akzeptanzkriterien:',
    })
  );

  assert.equal(result.findings.critical.length, 1);
  assert.equal(result.findings.critical[0]?.semanticEvaluation?.status, 'fail');
  assert.equal(result.findings.fulfilled.length, 0);
});

test('custom deterministic title rule passes for a specific title', () => {
  const result = runRulesetAnalysis(
    buildIssue({
      summary: 'BE-12: UI Test failed',
    }),
    ['custom-evaluator-test-set'],
    buildCustomRuleset({
      id: 'rule-det-title-pass',
      name: 'Titel klar',
      checkDescription: 'Titel darf nicht generisch sein.',
      severity: 'warning',
      evaluatorType: 'deterministic',
      example: '',
    })
  );

  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
  assert.equal(result.findings.warnings.length, 0);
});

test('custom semantic_llm rule fails when no rule keywords appear in main description', () => {
  const result = runRulesetAnalysis(
    buildIssue({
      description: 'Technische Umstellung auf neuen Endpoint ohne Nutzenbeschreibung.',
    }),
    ['custom-evaluator-test-set'],
    buildCustomRuleset({
      id: 'rule-sem-fail',
      name: 'Nutzernutzen klar',
      checkDescription: 'Nutzen und Mehrwert muessen klar beschrieben sein.',
      severity: 'warning',
      evaluatorType: 'semantic_llm',
      example: '',
    })
  );

  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  assert.equal(result.findings.fulfilled.length, 0);
});

test('custom semantic_llm rule passes when enough keywords appear in main description', () => {
  const result = runRulesetAnalysis(
    buildIssue({
      description: 'Der Nutzen ist klar und der Mehrwert fuer das Team ist sichtbar.',
    }),
    ['custom-evaluator-test-set'],
    buildCustomRuleset({
      id: 'rule-sem-pass',
      name: 'Nutzernutzen klar',
      checkDescription: 'Nutzen und Mehrwert muessen klar beschrieben sein.',
      severity: 'warning',
      evaluatorType: 'semantic_llm',
      example: '',
    })
  );

  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
  assert.equal(result.findings.warnings.length, 0);
});
