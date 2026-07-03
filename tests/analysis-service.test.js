import test from 'node:test';
import assert from 'node:assert/strict';
import { runRulesetAnalysis } from '../src/services/analysis-service.js';

test('basic-quality evaluates deterministic priority and estimation checks', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-50',
      summary: 'Ticket mit Basisdaten',
      description: 'Kurze Beschreibung des Tickets.',
      acceptanceCriteria: '1. Funktioniert\n2. Ist testbar',
      priority: { name: 'Medium' },
      estimate: { seconds: 3600 },
    },
    ['basic-quality']
  );

  const fulfilledIds = result.findings.fulfilled.map(finding => finding.id);
  const warningIds = result.findings.warnings.map(finding => finding.id);
  const criticalIds = result.findings.critical.map(finding => finding.id);

  assert.deepEqual(
    fulfilledIds.sort(),
    [
      'acceptance_criteria_present',
      'description_present',
      'estimation_present',
      'priority_present',
      'title_present',
    ].sort()
  );
  assert.deepEqual(warningIds, []);
  assert.deepEqual(criticalIds, []);
});

test('basic-quality reports missing priority and estimate as warnings', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-51',
      summary: 'Ticket ohne Planungskontext',
      description: 'Kurze Beschreibung des Tickets.',
      acceptanceCriteria: '1. Funktioniert\n2. Ist testbar',
      priority: null,
      estimate: null,
    },
    ['basic-quality']
  );

  const warningIds = result.findings.warnings.map(finding => finding.id).sort();

  assert.deepEqual(warningIds, ['estimation_missing', 'priority_missing']);
});

test('basic-quality reports acceptance_criteria_missing as critical even without a description, since AC lives in its own native field', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-90',
      summary: 'Ticket ganz ohne Beschreibung',
      description: '',
      acceptanceCriteria: null,
      priority: { name: 'Medium' },
      estimate: { seconds: 3600 },
    },
    ['basic-quality']
  );

  const criticalIds = result.findings.critical.map(f => f.id);
  assert.ok(
    criticalIds.includes('acceptance_criteria_missing'),
    'AC must be evaluated (and be critical) independently of the description field'
  );

  const acFinding = result.findings.critical.find(f => f.id === 'acceptance_criteria_missing');
  assert.equal(acFinding?.fixable, true);
});

test('basic-quality reports acceptance_criteria_present when the native field has usable content', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-91',
      summary: 'Ticket ganz ohne Beschreibung, aber mit AC-Feld',
      description: '',
      acceptanceCriteria: '1. Funktioniert\n2. Ist testbar',
      priority: { name: 'Medium' },
      estimate: { seconds: 3600 },
    },
    ['basic-quality']
  );

  const fulfilledIds = result.findings.fulfilled.map(f => f.id);
  assert.ok(fulfilledIds.includes('acceptance_criteria_present'));
});

test('ai-quality reports both user value and missing examples for the BE-10-style description', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-39',
      summary: 'BE-10: KI-Usage und Balance serverseitig verwalten',
      description: `Beschreibung:
Der aktuelle KI-Balance-Indikator basiert noch auf Demo-Logik. Produktiv brauchen wir eine serverseitige Verwaltung von Request-Verbrauch und verbleibendem Kontingent.

Technische Notiz:
Die genaue Abrechnungslogik kann zunächst einfach sein, solange sie sauber gekapselt ist und später erweitert werden kann.

Akzeptanzkriterien:
- Der KI-Balance-Indikator muss serverseitig die Anzahl der verarbeiteten Requests erfassen und protokollieren.`,
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['ai-quality']
  );

  const criticalIds = result.findings.critical.map(finding => finding.id).sort();

  assert.deepEqual(criticalIds, ['examples_missing', 'user_value_unclear']);
});

test('ai-quality reports fulfilled findings when user value and concrete examples are explicitly present', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-39',
      summary: 'BE-10: KI-Usage und Balance serverseitig verwalten',
      description: `Beschreibung:
Der aktuelle KI-Balance-Indikator basiert noch auf Demo-Logik.
Nutzen: Die serverseitige Verwaltung macht den Verbrauch für Nutzer und Team nachvollziehbar, sodass KI-Funktionen kontrolliert eingesetzt werden können.
Beispiel: Wenn ein Nutzer sein Kontingent aufbraucht, sieht er eine klare Meldung und kann die Ursache direkt nachvollziehen.

Technische Notiz:
Die genaue Abrechnungslogik kann zunächst einfach sein, solange sie sauber gekapselt ist und später erweitert werden kann.`,
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['ai-quality']
  );

  const criticalIds = result.findings.critical.map(finding => finding.id);
  const fulfilledIds = result.findings.fulfilled.map(finding => finding.id).sort();

  assert.deepEqual(criticalIds, []);
  assert.deepEqual(fulfilledIds, ['examples_present', 'user_value_present']);
});

test('ai-quality also recognizes naturally phrased value and scenario text without rigid labels', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-39',
      summary: 'BE-10: KI-Usage und Balance serverseitig verwalten',
      description: `Beschreibung:
Um die Nutzung der KI-Ressourcen effizient und nachvollziehbar zu gestalten, wird eine serverseitige Verwaltung des Request-Verbrauchs und des verbleibenden Kontingents benötigt.
Wenn ein Nutzer sein Kontingent überschreitet, erhält er eine klare Rückmeldung und kann die Ursache direkt nachvollziehen.

Technische Notiz:
Die genaue Abrechnungslogik kann zunächst einfach sein, solange sie sauber gekapselt ist und später erweitert werden kann.`,
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['ai-quality']
  );

  const criticalIds = result.findings.critical.map(finding => finding.id);
  const fulfilledIds = result.findings.fulfilled.map(finding => finding.id).sort();

  assert.deepEqual(criticalIds, []);
  assert.deepEqual(fulfilledIds, ['examples_present', 'user_value_present']);
});

test('findings expose evaluator types so deterministic and semantic rules can be distinguished explicitly', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-60',
      summary: 'Ticket mit Basisdaten',
      description: `Beschreibung:
Um die Analyse nachvollziehbar zu machen, wird der aktuelle Ticketzustand geprüft.
Wenn ein Nutzer das Ticket öffnet, sieht er direkt den aktuellen Status.`,
      acceptanceCriteria: '1. Funktioniert\n2. Ist testbar',
      priority: { name: 'Medium' },
      estimate: { seconds: 1800 },
    },
    ['basic-quality', 'ai-quality']
  );

  const acceptanceCriteriaFinding = result.findings.fulfilled.find(
    finding => finding.id === 'acceptance_criteria_present'
  );
  const userValueFinding = result.findings.fulfilled.find(
    finding => finding.id === 'user_value_present'
  );

  assert.equal(acceptanceCriteriaFinding?.evaluatorType, 'deterministic');
  assert.equal(userValueFinding?.evaluatorType, 'semantic_llm');
});

test('semantic heuristic findings expose evaluation contract and evidence', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-61',
      summary: 'Ticket mit schwacher Beschreibung',
      description: `Beschreibung:
Technische Umsetzung des Flows.

Technische Notiz:
Bleibt erstmal einfach.`,
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['ai-quality']
  );

  const userValueFinding = result.findings.critical.find(
    finding => finding.id === 'user_value_unclear'
  );

  assert.equal(userValueFinding?.evaluatorType, 'semantic_llm');
  assert.equal(userValueFinding?.semanticEvaluation?.status, 'fail');
  assert.equal(userValueFinding?.semanticEvaluation?.scope, 'main_description');
  assert.deepEqual(
    userValueFinding?.semanticEvaluationContract?.evidenceSchema,
    ['matched_marker', 'matched_sentence', 'missing_description_body']
  );
  assert.equal(Array.isArray(userValueFinding?.semanticEvaluation?.evidence), true);
});

test('semantic heuristic findings can report not_testable when there is no evaluable description body', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-62',
      summary: 'Ticket ohne Beschreibungskörper',
      description: `Technische Notiz:
Nur eine technische Notiz ohne eigentliche Beschreibung.`,
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['ai-quality']
  );

  const userValueFinding = result.findings.info.find(
    finding => finding.id === 'user_value_unclear'
  );
  const examplesFinding = result.findings.info.find(
    finding => finding.id === 'examples_missing'
  );

  assert.equal(userValueFinding?.semanticEvaluation?.status, 'not_testable');
  assert.equal(examplesFinding?.semanticEvaluation?.status, 'not_testable');
  assert.equal(userValueFinding?.severity, 'info');
  assert.equal(examplesFinding?.severity, 'info');
  assert.deepEqual(userValueFinding?.semanticEvaluation?.evidence, [
    { type: 'missing_description_body', detail: 'Kein primärer Beschreibungstext vorhanden.' },
  ]);
});

test('not_testable semantic findings are neutral and do not reduce score', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-63',
      summary: 'Ticket ohne auswertbaren Beschreibungsteil',
      description: `Technische Notiz:
Nur eine technische Notiz ohne eigentliche Beschreibung.`,
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['ai-quality']
  );

  assert.equal(result.score, 100);
  assert.equal(result.summary.neutral, 2);
  assert.equal(result.findings.critical.length, 0);
  assert.equal(result.findings.info.length, 2);
});

test('deterministic title custom rule without explicit marker passes for specific title', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-64',
      summary: 'BE-12: UI Test failed',
      description: 'Beschreibung fuer benutzerdefinierte Regeltests.',
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['custom-be13-set'],
    [
      {
        id: 'custom-be13-set',
        name: 'BE13 Test Set A',
        rules: [
          {
            id: 'rule-1',
            name: 'Titel klar',
            checkDescription: 'Titel darf nicht generisch sein.',
            severity: 'warning',
            evaluatorType: 'deterministic',
          },
        ],
      },
    ]
  );

  assert.equal(result.score, 100);
  assert.equal(result.summary.neutral, 0);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.critical.length, 0);
  assert.equal(result.findings.warnings.length, 0);
  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.fulfilled[0]?.id, 'custom_rule:custom-be13-set:rule-1');
  assert.equal(result.findings.fulfilled[0]?.title, 'Titel klar');
  assert.equal(result.findings.fulfilled[0]?.evaluatorType, 'deterministic');
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
});

test('deterministic title custom rule fails for very generic short title', () => {
  const result = runRulesetAnalysis(
    {
      key: 'KAN-64A',
      summary: 'Test',
      description: 'Beschreibung fuer benutzerdefinierte Regeltests.',
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['custom-be13-set'],
    [
      {
        id: 'custom-be13-set',
        name: 'BE13 Test Set A',
        rules: [
          {
            id: 'rule-1',
            name: 'Titel klar',
            checkDescription: 'Titel darf nicht generisch sein.',
            severity: 'warning',
            evaluatorType: 'deterministic',
          },
        ],
      },
    ]
  );

  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
});

test('deterministic custom rule fails when its marker is missing and passes when present', () => {
  const issueBase = {
    key: 'KAN-65',
    summary: 'Checkout verbessern',
    description: 'Die Checkout-Strecke wird robuster gemacht.',
    priority: { name: 'Medium' },
    estimate: null,
  };

  const customRulesets = [
    {
      id: 'custom-det-set',
      name: 'Deterministische Regeln',
      rules: [
        {
          id: 'rule-det-1',
          name: 'Muss "Akzeptanzkriterien:" enthalten',
          checkDescription: 'Beschreibung enthaelt die Ueberschrift Akzeptanzkriterien',
          severity: 'critical',
          evaluatorType: 'deterministic',
          example: 'Akzeptanzkriterien:',
        },
      ],
    },
  ];

  const failedResult = runRulesetAnalysis(issueBase, ['custom-det-set'], customRulesets);
  assert.equal(failedResult.findings.critical.length, 1);
  assert.equal(failedResult.findings.critical[0]?.semanticEvaluation?.status, 'fail');

  const passedResult = runRulesetAnalysis(
    {
      ...issueBase,
      description: `${issueBase.description}\n\nAkzeptanzkriterien:\n1. Ist testbar`,
    },
    ['custom-det-set'],
    customRulesets
  );
  assert.equal(passedResult.findings.fulfilled.length, 1);
  assert.equal(passedResult.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
});

test('semantic_llm custom rule evaluates based on rule keywords in main description', () => {
  const customRulesets = [
    {
      id: 'custom-sem-set',
      name: 'Semantik Regeln',
      rules: [
        {
          id: 'rule-sem-1',
          name: 'Nutzernutzen klar',
          checkDescription: 'Nutzen und Mehrwert muessen in der Beschreibung stehen',
          severity: 'warning',
          evaluatorType: 'semantic_llm',
          example: '',
        },
      ],
    },
  ];

  const failedResult = runRulesetAnalysis(
    {
      key: 'KAN-66',
      summary: 'Refactoring Checkout',
      description: 'Technische Umstrukturierung der Komponenten.',
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['custom-sem-set'],
    customRulesets
  );
  assert.equal(failedResult.findings.warnings.length, 1);
  assert.equal(failedResult.findings.warnings[0]?.semanticEvaluation?.status, 'fail');

  const passedResult = runRulesetAnalysis(
    {
      key: 'KAN-67',
      summary: 'Checkout Flow',
      description: 'Der Nutzen ist klar: Mehrwert fuer Nutzer durch schnellere Kaufabwicklung.',
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['custom-sem-set'],
    customRulesets
  );
  assert.equal(passedResult.findings.fulfilled.length, 1);
  assert.equal(passedResult.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
});

test('custom semantic_llm findings are fixable only when the rule fails', () => {
  const customRulesets = [
    {
      id: 'custom-fixable-set',
      name: 'Fixable Rules',
      rules: [
        {
          id: 'rule-sem-fixable',
          name: 'Nutzernutzen klar',
          checkDescription: 'Nutzen und Mehrwert muessen klar beschrieben sein.',
          severity: 'warning',
          evaluatorType: 'semantic_llm',
          example: '',
        },
      ],
    },
  ];

  const failedResult = runRulesetAnalysis(
    {
      key: 'KAN-68',
      summary: 'Refactoring',
      description: 'Technische Umstellung ohne Nutzenbeschreibung.',
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['custom-fixable-set'],
    customRulesets
  );

  const passedResult = runRulesetAnalysis(
    {
      key: 'KAN-69',
      summary: 'Refactoring',
      description: 'Der Nutzen ist klar und der Mehrwert fuer Nutzer wird explizit genannt.',
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['custom-fixable-set'],
    customRulesets
  );

  assert.equal(failedResult.findings.warnings.length, 1);
  assert.equal(failedResult.findings.warnings[0]?.fixable, true);
  assert.equal(failedResult.findings.warnings[0]?.ruleName, 'Nutzernutzen klar');
  assert.equal(failedResult.findings.warnings[0]?.ruleIntent, 'Fixable Rules');
  assert.equal(failedResult.findings.warnings[0]?.whatShouldBeChecked, 'Nutzen und Mehrwert muessen klar beschrieben sein.');

  assert.equal(passedResult.findings.fulfilled.length, 1);
  assert.equal(passedResult.findings.fulfilled[0]?.fixable, false);
});

test('custom rule with main_description scope is not_testable when description is missing', () => {
  const customRulesets = [
    {
      id: 'description-scope-set',
      name: 'Description Scope Rules',
      appliesTo: ['Story'],
      rules: [
        {
          id: 'needs-ac',
          name: 'Akzeptanzkriterien vorhanden',
          checkDescription: 'Akzeptanzkriterien muessen als Bulletpoints vorhanden sein.',
          severity: 'critical',
          evaluatorType: 'semantic_llm',
          scope: 'main_description',
          example: '',
        },
      ],
      createdAt: 1,
    },
  ];

  const result = runRulesetAnalysis(
    {
      key: 'KAN-80',
      summary: 'Ticket ohne Beschreibung',
      description: '',
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['description-scope-set'],
    customRulesets
  );

  assert.equal(result.findings.critical.length, 0, 'rule must not be critical when description is missing');
  assert.equal(result.findings.warnings.length, 0, 'rule must not be a warning when description is missing');
  assert.equal(result.findings.info.length, 1, 'rule should be reported as not_testable (info bucket)');

  const finding = result.findings.info[0];
  assert.equal(finding.fixable, false, 'not_testable finding must not be marked fixable');
  assert.equal(finding.semanticEvaluation?.status, 'not_testable');
  assert.ok(
    (finding.semanticEvaluation?.evidence ?? []).some(entry => entry?.type === 'missing_description_body'),
    'evidence must explain that the description is missing'
  );
});

test('custom rule with full_description scope is not_testable when description is missing', () => {
  const customRulesets = [
    {
      id: 'full-scope-set',
      name: 'Full Description Scope Rules',
      appliesTo: ['Story'],
      rules: [
        {
          id: 'needs-keywords',
          name: 'Pflichtbegriff erwaehnt',
          checkDescription: 'Der Begriff Risiko muss erwaehnt werden.',
          severity: 'warning',
          evaluatorType: 'deterministic',
          scope: 'full_description',
          example: 'Risiko',
        },
      ],
      createdAt: 1,
    },
  ];

  const result = runRulesetAnalysis(
    {
      key: 'KAN-81',
      summary: 'Ticket ohne Beschreibung',
      description: '',
      priority: { name: 'Medium' },
      estimate: null,
    },
    ['full-scope-set'],
    customRulesets
  );

  assert.equal(result.findings.warnings.length, 0, 'deterministic rule must not FAIL on an empty description');
  assert.equal(result.findings.info.length, 1);
  assert.equal(result.findings.info[0].semanticEvaluation?.status, 'not_testable');
});
