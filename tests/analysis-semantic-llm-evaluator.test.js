import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/services/analysis-service.js';

function createBaseAnalysis() {
  return {
    issue: {
      key: 'KAN-LLM-1',
      summary: 'BE-13',
      description: 'Technische Beschreibung.',
      issueType: { name: 'Story' },
      priority: { name: 'Medium' },
      labels: [],
      status: { name: 'In Arbeit' },
    },
    activeRulesetIds: ['custom-set'],
    score: 90,
    summary: { critical: 0, hints: 1, neutral: 0, fulfilled: 0 },
    findings: {
      critical: [],
      warnings: [
        {
          id: 'custom_rule:custom-set:rule-1',
          title: 'Nutzernutzen klar',
          description: 'Nutzen und Mehrwert muessen klar beschrieben sein.',
          impact: 'Benutzerdefinierte Regel ist aktuell nicht erfuellt.',
          severity: 'warning',
          customRuleSeverity: 'warning',
          evaluatorType: 'semantic_llm',
          ruleName: 'Nutzernutzen klar',
          ruleIntent: 'Custom Set',
          whatShouldBeChecked: 'Nutzen und Mehrwert muessen klar beschrieben sein.',
          fixable: true,
          semanticEvaluation: {
            status: 'fail',
            scope: 'main_description',
            evidence: [{ type: 'matched_keywords', detail: 'Keine Treffer' }],
          },
        },
      ],
      info: [],
      fulfilled: [],
    },
  };
}

test('semantic_llm evaluation upgrades finding to fulfilled when recommendation severity is fulfilled', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            severity: 'fulfilled',
            rationale: 'Nutzen ist klar fuer den Nutzer beschrieben.',
          },
        ],
      },
    }),
  });

  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.warnings.length, 0);
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
  assert.equal(result.findings.fulfilled[0]?.fixable, false);
});

test('semantic_llm evaluation preserves fulfilled verdict even when rationale incidentally mentions not_testable', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            severity: 'fulfilled',
            rationale:
              'Generally not always testable in every context, but the description clearly states the user value.',
          },
        ],
      },
    }),
  });

  // fulfilled severity must win — the bystander "not testable" phrase in the
  // rationale must not demote a clear positive verdict to info/not_testable.
  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
  assert.equal(result.findings.fulfilled[0]?.fixable, false);
});

test('semantic_llm evaluation keeps finding failed and fixable when recommendation severity is warning', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            severity: 'warning',
            rationale: 'Der konkrete Nutzwert ist nicht erkennbar.',
          },
        ],
      },
    }),
  });

  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  assert.equal(result.findings.warnings[0]?.fixable, true);
});

test('semantic_llm evaluation returns not_testable when rationale signals not_testable', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            severity: 'warning',
            rationale: 'not_testable: nicht genug Ticketkontext vorhanden.',
          },
        ],
      },
    }),
  });

  assert.equal(result.findings.info.length, 1);
  assert.equal(result.findings.info[0]?.semanticEvaluation?.status, 'not_testable');
  assert.equal(result.findings.info[0]?.fixable, false);
});

test('semantic_llm evaluation preserves heuristic finding when LLM call fails, extending evidence with error', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => {
      throw new Error('Provider timeout');
    },
  });

  // Heuristic result (warning/fail) is preserved — the finding must NOT move to info.
  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  // Evidence is extended with the llm_error entry.
  const allEvidence = result.findings.warnings[0]?.semanticEvaluation?.evidence ?? [];
  assert.ok(
    allEvidence.some(entry => /Provider timeout/.test(entry.detail ?? '')),
    'expected llm_error evidence entry containing the error message'
  );
});

test('semantic_llm evaluation matches recommendation by ruleId instead of always using first recommendation', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            ruleId: 'unrelated-rule',
            title: 'Andere Regel',
            severity: 'warning',
            rationale: 'Unrelated warning that should not be applied to this finding.',
          },
          {
            ruleId: 'custom_rule:custom-set:rule-1',
            title: 'Nutzernutzen klar',
            severity: 'fulfilled',
            rationale: 'Der Nutzernutzen ist im Ticket klar beschrieben.',
          },
        ],
      },
    }),
  });

  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.warnings.length, 0);
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
});

test('semantic_llm evaluation preserves heuristic finding when multiple recommendations are ambiguous', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            ruleId: 'unrelated-rule-a',
            title: 'Andere Regel A',
            severity: 'warning',
            rationale: 'Nicht fuer dieses Finding.',
          },
          {
            ruleId: 'unrelated-rule-b',
            title: 'Andere Regel B',
            severity: 'warning',
            rationale: 'Auch nicht fuer dieses Finding.',
          },
        ],
      },
    }),
  });

  // Heuristic result preserved — ambiguous contract must not move the finding to info.
  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  const allEvidence = result.findings.warnings[0]?.semanticEvaluation?.evidence ?? [];
  assert.ok(
    allEvidence.some(entry => /ambiguous_recommendation_set/.test(entry.detail ?? '')),
    'expected contract evidence entry with ambiguous_recommendation_set reason'
  );
});

test('semantic_llm evaluation preserves heuristic finding when recommendations are missing', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [],
      },
    }),
  });

  // Heuristic result preserved — missing recommendations must not move the finding to info.
  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  const allEvidence = result.findings.warnings[0]?.semanticEvaluation?.evidence ?? [];
  assert.ok(
    allEvidence.some(entry => /missing_recommendation/.test(entry.detail ?? '')),
    'expected contract evidence entry with missing_recommendation reason'
  );
});

test('semantic_llm evaluation preserves heuristic finding when no exact ruleId match exists in multi-recommendation output', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            severity: 'warning',
            title: 'Technische Verbesserung',
            rationale: 'Caching und Serializer optimieren.',
          },
          {
            severity: 'fulfilled',
            title: 'Bewertung',
            rationale: 'Mehrwert und Nutzernutzen sind klar beschrieben und nachvollziehbar.',
          },
        ],
      },
    }),
  });

  // Heuristic result preserved — ambiguous multi-recommendation output must not move the finding to info.
  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  const allEvidence = result.findings.warnings[0]?.semanticEvaluation?.evidence ?? [];
  assert.ok(
    allEvidence.some(entry => /ambiguous_recommendation_set/.test(entry.detail ?? '')),
    'expected contract evidence entry with ambiguous_recommendation_set reason'
  );
});

test('semantic_llm evaluation preserves heuristic finding when recommendation severity is invalid', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [{ severity: 'maybe', rationale: 'Unsicheres Ergebnis ohne gueltige Severity.' }],
      },
    }),
  });

  // Heuristic result preserved — invalid severity must not move the finding to info.
  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  const allEvidence = result.findings.warnings[0]?.semanticEvaluation?.evidence ?? [];
  assert.ok(
    allEvidence.some(entry => /invalid_recommendation_severity/.test(entry.detail ?? '')),
    'expected contract evidence entry with invalid_recommendation_severity reason'
  );
});

function createRealisticSemanticAnalysis({ issueKey, summary, description }) {
  return {
    issue: {
      key: issueKey,
      summary,
      description,
      issueType: { name: 'Story' },
      priority: { name: 'High' },
      labels: ['frontend', 'quality'],
      status: { name: 'In Arbeit' },
    },
    activeRulesetIds: ['custom-semantic-set'],
    score: 90,
    summary: { critical: 0, hints: 1, neutral: 0, fulfilled: 0 },
    findings: {
      critical: [],
      warnings: [
        {
          id: 'custom_rule:custom-semantic-set:rule-user-value',
          title: 'Nutzernutzen klar',
          description: 'Der Business-Nutzen fuer Nutzer muss im Ticket klar erkennbar sein.',
          impact: 'Benutzerdefinierte Regel ist aktuell nicht erfuellt.',
          severity: 'warning',
          customRuleSeverity: 'warning',
          evaluatorType: 'semantic_llm',
          ruleName: 'Nutzernutzen klar',
          ruleIntent: 'Team Rule Set',
          whatShouldBeChecked: 'Der Business-Nutzen fuer Nutzer muss klar beschrieben sein.',
          fixable: true,
          semanticEvaluation: {
            status: 'fail',
            scope: 'main_description',
            evidence: [{ type: 'matched_keywords', detail: 'Keine Treffer' }],
          },
        },
      ],
      info: [],
      fulfilled: [],
    },
  };
}

test('realistic case 1: checkout performance ticket is pass when user value is explicit', async () => {
  const analysis = createRealisticSemanticAnalysis({
    issueKey: 'KAN-R1',
    summary: 'Checkout-Ladezeit unter 2 Sekunden bringen',
    description: `Beschreibung:
Die Ladezeit im Checkout soll deutlich reduziert werden, damit Kunden den Kauf schneller abschliessen und weniger Abbrueche entstehen.

Akzeptanzkriterien:
- Checkout-Seite laedt in unter 2 Sekunden.`,
  });

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [{ severity: 'fulfilled', rationale: 'Der konkrete Nutzwert ist explizit beschrieben.' }],
      },
    }),
  });

  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
  assert.equal(result.findings.warnings.length, 0);
});

test('realistic case 2: backend refactor ticket is fail when only technical details are present', async () => {
  const analysis = createRealisticSemanticAnalysis({
    issueKey: 'KAN-R2',
    summary: 'Refactoring der API-Response-Serializer',
    description: `Beschreibung:
Die Serializer-Schicht wird aufgeteilt und interne Mapper werden umbenannt.
Es werden neue Helper-Klassen eingefuehrt.`,
  });

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [{ severity: 'warning', rationale: 'Der Nutzen fuer Endnutzer ist nicht erkennbar.' }],
      },
    }),
  });

  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  assert.equal(result.findings.warnings[0]?.fixable, true);
});

test('realistic case 3: minimal ticket context is not_testable', async () => {
  const analysis = createRealisticSemanticAnalysis({
    issueKey: 'KAN-R3',
    summary: 'UI Test failed',
    description: 'Fehlgeschlagen.',
  });

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [{ severity: 'warning', rationale: 'not_testable: Zu wenig fachlicher Kontext im Ticket.' }],
      },
    }),
  });

  assert.equal(result.findings.info.length, 1);
  assert.equal(result.findings.info[0]?.semanticEvaluation?.status, 'not_testable');
  assert.equal(result.findings.warnings.length, 0);
});

test('realistic case 4: provider outage preserves heuristic finding instead of overriding it', async () => {
  const analysis = createRealisticSemanticAnalysis({
    issueKey: 'KAN-R4',
    summary: 'Fehlerbild im Login-Flow reduzieren',
    description: `Beschreibung:
Beim Login tritt sporadisch ein 500er auf. Nutzer koennen sich dann nicht anmelden.`,
  });

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => {
      throw new Error('OpenAI 503 service unavailable');
    },
  });

  // Heuristic result preserved — provider outage must not replace the finding with info.
  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  const allEvidence = result.findings.warnings[0]?.semanticEvaluation?.evidence ?? [];
  assert.ok(
    allEvidence.some(entry => /503/.test(entry.detail ?? '')),
    'expected llm_error evidence entry containing the status code'
  );
});

test('realistic case 5: mixed findings update only semantic_llm findings and keep deterministic unchanged', async () => {
  const analysis = createRealisticSemanticAnalysis({
    issueKey: 'KAN-R5',
    summary: 'Search Filter UX verbessern',
    description: `Beschreibung:
Die Filterlogik wird angepasst, damit Nutzer Ergebnisse schneller eingrenzen koennen.`,
  });

  analysis.findings.warnings.push({
    id: 'custom_rule:custom-semantic-set:rule-title-quality',
    title: 'Titel klar',
    description: 'Titel darf nicht generisch sein.',
    impact: 'Benutzerdefinierte Regel ist aktuell nicht erfuellt.',
    severity: 'warning',
    customRuleSeverity: 'warning',
    evaluatorType: 'deterministic',
    ruleName: 'Titel klar',
    ruleIntent: 'Team Rule Set',
    whatShouldBeChecked: 'Titel darf nicht generisch sein.',
    fixable: false,
    semanticEvaluation: {
      status: 'fail',
      scope: 'full_description',
      evidence: [{ type: 'generic_title', detail: 'Titel wirkt zu allgemein.' }],
    },
  });

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [{ severity: 'fulfilled', rationale: 'Nutzernutzen ist klar im Beschreibungstext.' }],
      },
    }),
  });

  const semanticFinding = result.findings.fulfilled.find(
    item => item.id === 'custom_rule:custom-semantic-set:rule-user-value'
  );
  const deterministicFinding = result.findings.warnings.find(
    item => item.id === 'custom_rule:custom-semantic-set:rule-title-quality'
  );

  assert.equal(semanticFinding?.semanticEvaluation?.status, 'pass');
  assert.equal(deterministicFinding?.semanticEvaluation?.status, 'fail');
  assert.equal(deterministicFinding?.evaluatorType, 'deterministic');
});

test('semantic_llm preserves title scope and passes scoped payload for title-focused custom rule', async () => {
  const analysis = {
    issue: {
      key: 'KAN-R6',
      summary: 'Test',
      description: 'Beschreibung mit technischem Kontext.',
      issueType: { name: 'Story' },
      priority: { name: 'Medium' },
      labels: [],
      status: { name: 'In Arbeit' },
    },
    activeRulesetIds: ['custom-semantic-set'],
    score: 90,
    summary: { critical: 0, hints: 1, neutral: 0, fulfilled: 0 },
    findings: {
      critical: [],
      warnings: [
        {
          id: 'custom_rule:custom-semantic-set:rule-title-clarity',
          title: 'Titel klar',
          description: 'Titel darf nicht generisch sein.',
          impact: 'Benutzerdefinierte Regel ist aktuell nicht erfuellt.',
          severity: 'warning',
          customRuleSeverity: 'warning',
          evaluatorType: 'semantic_llm',
          ruleName: 'Titel klar',
          ruleIntent: 'Team Rule Set',
          whatShouldBeChecked: 'Titel darf nicht generisch sein.',
          fixable: true,
          semanticEvaluation: {
            status: 'fail',
            scope: 'title',
            evidence: [{ type: 'matched_keywords', detail: 'Keine Treffer' }],
          },
        },
      ],
      info: [],
      fulfilled: [],
    },
  };

  let capturedInput = null;
  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async input => {
      capturedInput = input;
      return {
        output: {
          recommendations: [{ severity: 'warning', rationale: 'Titel ist noch zu generisch.' }],
        },
      };
    },
  });

  assert.equal(capturedInput?.customRule?.scope, 'title');
  assert.equal(capturedInput?.customRule?.scopedText, 'test');
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.scope, 'title');
});

test('semantic_llm evaluation preserves heuristic finding when single recommendation has explicit ruleId mismatch', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            ruleId: 'custom_rule:other-set:other-rule',
            title: 'Andere Regel',
            severity: 'fulfilled',
            rationale: 'Diese Recommendation gehoert zu einer anderen Regel.',
          },
        ],
      },
    }),
  });

  // Heuristic result preserved — a ruleId mismatch must not move the finding to info.
  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.fulfilled.length, 0);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  const allEvidence = result.findings.warnings[0]?.semanticEvaluation?.evidence ?? [];
  assert.ok(
    allEvidence.some(entry => /single_recommendation_explicit_mismatch/.test(entry.detail ?? '')),
    'expected contract evidence entry with single_recommendation_explicit_mismatch reason'
  );
});

test('semantic_llm evaluation still applies single recommendation fallback when ruleId is null', async () => {
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            ruleId: null,
            title: 'Nutzernutzen klar',
            severity: 'fulfilled',
            rationale: 'Nutzen ist klar beschrieben.',
          },
        ],
      },
    }),
  });

  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
  assert.equal(result.findings.warnings.length, 0);
});

test('built-in semantic findings are not routed through custom semantic llm contract flow', async () => {
  const analysis = {
    issue: {
      key: 'KAN-BUILTIN-1',
      summary: 'Search Filter UX verbessern',
      description:
        'Damit Nutzer schneller passende Ergebnisse sehen, wird die Filterlogik verbessert. Beispiel: Status = ueberfaellig.',
      issueType: { name: 'Story' },
      priority: { name: 'Medium' },
      labels: [],
      status: { name: 'In Arbeit' },
    },
    activeRulesetIds: ['ai-quality'],
    score: 100,
    summary: { critical: 0, hints: 0, neutral: 0, fulfilled: 1 },
    findings: {
      critical: [],
      warnings: [],
      info: [],
      fulfilled: [
        {
          id: 'user_value_present',
          title: 'User Value erkennbar',
          description: 'Im Ticket ist der fachliche Nutzen oder Mehrwert klar beschrieben.',
          impact: 'Ziel und Nutzen der Anforderung sind nachvollziehbar.',
          severity: 'fulfilled',
          evaluatorType: 'semantic_llm',
          fixable: false,
          semanticEvaluation: {
            status: 'pass',
            scope: 'main_description',
            evidence: [{ type: 'matched_marker', detail: 'damit' }],
          },
        },
      ],
    },
  };

  let llmCalls = 0;
  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => {
      llmCalls += 1;
      return {
        output: {
          recommendations: [],
        },
      };
    },
  });

  assert.equal(llmCalls, 0);
  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.fulfilled[0]?.id, 'user_value_present');
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
});

test('semantic_llm inconclusive contract preserves fulfilled heuristic finding when recommendations are ambiguous', async () => {
  // Stage-A heuristic produced a PASS. LLM returns ambiguous recommendations without a
  // matching ruleId. The fulfilled result must be preserved, not demoted to info.
  const analysis = {
    issue: {
      key: 'KAN-INC-1',
      summary: 'Checkout-Ladezeit optimieren fuer bessere Nutzerkonversion',
      description: 'Der Nutzer profitiert von schnelleren Ladezeiten beim Checkout.',
      issueType: { name: 'Story' },
      priority: { name: 'High' },
      labels: [],
      status: { name: 'In Arbeit' },
    },
    activeRulesetIds: ['custom-set'],
    score: 100,
    summary: { critical: 0, hints: 0, neutral: 0, fulfilled: 1 },
    findings: {
      critical: [],
      warnings: [],
      info: [],
      fulfilled: [
        {
          id: 'custom_rule:custom-set:rule-1',
          title: 'Nutzernutzen klar',
          description: 'Nutzen und Mehrwert muessen klar beschrieben sein.',
          impact: 'Benutzerdefinierte Regel ist erfuellt.',
          severity: 'fulfilled',
          customRuleSeverity: 'warning',
          evaluatorType: 'semantic_llm',
          ruleName: 'Nutzernutzen klar',
          ruleIntent: 'Custom Set',
          whatShouldBeChecked: 'Nutzen und Mehrwert muessen klar beschrieben sein.',
          fixable: false,
          semanticEvaluation: {
            status: 'pass',
            scope: 'main_description',
            evidence: [{ type: 'matched_keywords', detail: '2 Treffer' }],
          },
        },
      ],
    },
  };

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          { ruleId: 'other-rule-a', severity: 'warning', rationale: 'Nicht relevant.' },
          { ruleId: 'other-rule-b', severity: 'warning', rationale: 'Auch nicht relevant.' },
        ],
      },
    }),
  });

  // fulfilled heuristic must stay fulfilled — ambiguous contract must not demote it.
  assert.equal(result.findings.fulfilled.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.fulfilled[0]?.semanticEvaluation?.status, 'pass');
  const allEvidence = result.findings.fulfilled[0]?.semanticEvaluation?.evidence ?? [];
  assert.ok(
    allEvidence.some(entry => /ambiguous_recommendation_set/.test(entry.detail ?? '')),
    'expected ambiguous_recommendation_set in extended evidence'
  );
});

test('semantic_llm inconclusive contract preserves fail heuristic finding when recommendations are ambiguous', async () => {
  // Stage-A heuristic produced a FAIL. LLM returns ambiguous recommendations.
  // The fail result must be preserved, not replaced with info/not_testable.
  const analysis = createBaseAnalysis(); // base has severity: 'warning' / status: 'fail'

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          { ruleId: 'other-rule-a', severity: 'fulfilled', rationale: 'Gehoert zu anderer Regel.' },
          { ruleId: 'other-rule-b', severity: 'warning', rationale: 'Auch nicht relevant.' },
        ],
      },
    }),
  });

  // fail heuristic must stay as warning — ambiguous contract must not demote it to info.
  assert.equal(result.findings.warnings.length, 1);
  assert.equal(result.findings.info.length, 0);
  assert.equal(result.findings.warnings[0]?.semanticEvaluation?.status, 'fail');
  const allEvidence = result.findings.warnings[0]?.semanticEvaluation?.evidence ?? [];
  assert.ok(
    allEvidence.some(entry => /ambiguous_recommendation_set/.test(entry.detail ?? '')),
    'expected ambiguous_recommendation_set in extended evidence'
  );
});

test('semantic_llm explicit not_testable via rationale still overrides to info when LLM uses valid severity', async () => {
  // The LLM consciously signals insufficient evidence: it provides a valid severity
  // (warning) AND marks the rationale with "not_testable". This explicit signal takes
  // precedence over the heuristic result — the explicit_not_testable path is preserved.
  const analysis = createBaseAnalysis();

  const result = await __testUtils.applySemanticLlmEvaluationsToAnalysis(analysis, {
    assistAnalysisWithLlmFn: async () => ({
      output: {
        recommendations: [
          {
            severity: 'warning',
            rationale: 'Description does not contain enough context — not_testable.',
          },
        ],
      },
    }),
  });

  // explicit_not_testable path: LLM deliberately signals "not enough evidence",
  // so the finding IS allowed to move to info.
  assert.equal(result.findings.info.length, 1);
  assert.equal(result.findings.info[0]?.semanticEvaluation?.status, 'not_testable');
  assert.equal(result.findings.warnings.length, 0);
});
