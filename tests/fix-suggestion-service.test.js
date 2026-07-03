import test from 'node:test';
import assert from 'node:assert/strict';
import {
  __testUtils,
  createFixSuggestionService,
} from '../src/services/fix-suggestion-service-core.js';

function createAnalysisResult() {
  return {
    issue: {
      key: 'KAN-41',
      summary: 'Provider implementieren',
      description: 'Beschreibung des Tickets',
      issueType: { name: 'Story' },
      priority: { name: 'Medium' },
      labels: ['llm'],
      status: { name: 'In Arbeit' },
    },
    activeRulesetIds: ['basic-quality'],
    findings: {
      critical: [
        {
          id: 'acceptance_criteria_missing',
          title: 'Fehlende Akzeptanzkriterien',
          description: 'Es fehlen testbare Kriterien.',
          impact: 'Keine saubere Abnahme möglich.',
          severity: 'critical',
          fixable: true,
        },
      ],
      warnings: [],
      fulfilled: [],
    },
  };
}

test('generateSingleFixSuggestion returns structured suggestion data', async () => {
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => createAnalysisResult(),
    generateSuggestionWithLlmFn: async () => ({
      provider: 'openai',
      model: 'gpt-4o-mini',
      output: {
        targetField: 'acceptanceCriteria',
        currentText: '',
        suggestedText: '1. Kriterium A\n2. Kriterium B\n3. Kriterium C',
        summary: 'Akzeptanzkriterien ergänzt',
        reasoning: 'Aus dem Ticketkontext abgeleitet.',
      },
    }),
  });

  const result = await service.generateSingleFixSuggestion({
    issueKey: 'KAN-41',
    findingId: 'acceptance_criteria_missing',
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.suggestion.findingId, 'acceptance_criteria_missing');
  assert.equal(result.suggestion.targetField, 'acceptanceCriteria');
  assert.equal(result.suggestion.currentText, 'Keine Akzeptanzkriterien definiert');
  assert.match(result.suggestion.suggestedText, /Kriterium A/);
});

test('generateSingleFixSuggestion returns structured error when finding is unavailable', async () => {
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => createAnalysisResult(),
    generateSuggestionWithLlmFn: async () => {
      throw new Error('should not be called');
    },
  });

  const result = await service.generateSingleFixSuggestion({
    issueKey: 'KAN-41',
    findingId: 'title_missing',
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(result.status, 'failed');
  assert.equal(result.error.code, 'FINDING_NOT_AVAILABLE');
  assert.equal(result.suggestion.status, 'failed');
});

test('generateBatchFixSuggestions returns per-item success and failure results', async () => {
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => ({
      ...createAnalysisResult(),
      findings: {
        critical: [
          ...createAnalysisResult().findings.critical,
          {
            id: 'description_missing',
            title: 'Keine Beschreibung vorhanden',
            description: 'Es fehlt eine Beschreibung.',
            impact: 'Umsetzung unklar.',
            severity: 'critical',
            fixable: true,
          },
        ],
        warnings: [],
        fulfilled: [],
      },
    }),
    generateSuggestionWithLlmFn: async (input) => {
      if (input.finding.id === 'description_missing') {
        throw new Error('Provider temporarily unavailable');
      }

      return {
        provider: 'openai',
        model: 'gpt-4o-mini',
        output: {
          targetField: 'acceptanceCriteria',
          currentText: '',
          suggestedText: '1. A\n2. B\n3. C',
          summary: 'Akzeptanzkriterien ergänzt',
          reasoning: 'Kontextbasiert.',
        },
      };
    },
  });

  const result = await service.generateBatchFixSuggestions({
    issueKey: 'KAN-41',
    findingIds: ['acceptance_criteria_missing', 'description_missing'],
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(result.summary.requested, 2);
  assert.equal(result.summary.succeeded, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.suggestions[0].status, 'completed');
  assert.equal(result.suggestions[1].status, 'failed');
  assert.equal(result.suggestions[1].error.code, 'SUGGESTION_FAILED');
});

test('generateBatchFixSuggestions runs findings concurrently and preserves input order', async () => {
  const callOrder = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const service = createFixSuggestionService({
    analyzeIssueFn: async () => ({
      ...createAnalysisResult(),
      findings: {
        critical: [
          { id: 'acceptance_criteria_missing', title: 'AC', description: '', impact: '', severity: 'critical', fixable: true },
          { id: 'description_missing', title: 'Desc', description: '', impact: '', severity: 'critical', fixable: true },
          { id: 'title_missing', title: 'Title', description: '', impact: '', severity: 'critical', fixable: true },
        ],
        warnings: [],
        fulfilled: [],
      },
    }),
    generateSuggestionWithLlmFn: async (input) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      callOrder.push(input.finding.id);
      // The first finding resolves slowest, so a correct implementation must
      // still return results in INPUT order, not completion order.
      const delayMs = input.finding.id === 'acceptance_criteria_missing' ? 40 : 5;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      inFlight -= 1;
      return {
        provider: 'openai',
        model: 'gpt-4o-mini',
        output: {
          targetField: 'description',
          currentText: '',
          suggestedText: `Beschreibung:\nFix fuer ${input.finding.id}`,
          summary: 'Fix',
          reasoning: 'Kontextbasiert.',
        },
      };
    },
  });

  const result = await service.generateBatchFixSuggestions({
    issueKey: 'KAN-41',
    findingIds: ['acceptance_criteria_missing', 'description_missing', 'title_missing'],
    activeRulesetIds: ['basic-quality'],
  });

  // All findings processed exactly once.
  assert.equal(callOrder.length, 3);
  // Bounded parallelism actually overlapped calls (would be 1 if sequential).
  assert.equal(maxInFlight, 2);
  // Results are returned in input order despite the first call finishing last.
  assert.deepEqual(
    result.suggestions.map(entry => entry.findingId),
    ['acceptance_criteria_missing', 'description_missing', 'title_missing']
  );
  assert.equal(result.summary.requested, 3);
  assert.equal(result.summary.succeeded, 3);
});

test('generateSingleFixSuggestion falls back to issue description when provider currentText is empty', async () => {
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => ({
      ...createAnalysisResult(),
      findings: {
        critical: [
          {
            id: 'description_missing',
            title: 'Keine Beschreibung vorhanden',
            description: 'Es fehlt eine Beschreibung.',
            impact: 'Umsetzung unklar.',
            severity: 'critical',
            fixable: true,
          },
        ],
        warnings: [],
        fulfilled: [],
      },
    }),
    generateSuggestionWithLlmFn: async () => ({
      provider: 'openai',
      model: 'gpt-4o-mini',
      output: {
        targetField: 'description',
        currentText: '',
        suggestedText: 'Neue konkrete Beschreibung',
        summary: 'Beschreibung ergänzt',
        reasoning: 'Kontextbasiert.',
      },
    }),
  });

  const result = await service.generateSingleFixSuggestion({
    issueKey: 'KAN-41',
    findingId: 'description_missing',
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.suggestion.targetField, 'description');
  assert.equal(result.suggestion.currentText, 'Keine Beschreibung vorhanden');
});

test('generateSingleFixSuggestion returns the full revised description including preserved sections', async () => {
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => ({
      issue: {
        key: 'KAN-41',
        summary: 'Provider implementieren',
        description: `Beschreibung:
Der aktuelle KI-Balance-Indikator basiert noch auf Demo-Logik.

Technische Notiz:
Die Logik soll später erweiterbar bleiben.

Akzeptanzkriterien:
1. Ein Kriterium`,
        issueType: { name: 'Story' },
        priority: { name: 'Medium' },
        labels: ['llm'],
        status: { name: 'In Arbeit' },
      },
      activeRulesetIds: ['ai-quality'],
      findings: {
        critical: [
          {
            id: 'user_value_unclear',
            title: 'User Value unklar',
            description: 'Der Nutzen ist unklar beschrieben.',
            impact: 'Mehrwert schwer nachvollziehbar.',
            severity: 'critical',
            fixable: true,
          },
        ],
        warnings: [],
        fulfilled: [],
      },
    }),
    generateSuggestionWithLlmFn: async () => ({
      provider: 'openai',
      model: 'gpt-4o-mini',
      output: {
        targetField: 'description',
        currentText: '',
        suggestedText: `Beschreibung:
Die serverseitige Verwaltung der KI-Balance schafft Transparenz über Verbrauch und verbleibendes Kontingent.`,
        summary: 'Beschreibung geschärft',
        reasoning: 'Nutzen klarer formuliert.',
      },
    }),
  });

  const result = await service.generateSingleFixSuggestion({
    issueKey: 'KAN-41',
    findingId: 'user_value_unclear',
    activeRulesetIds: ['ai-quality'],
  });

  assert.equal(result.status, 'completed');
  assert.match(result.suggestion.suggestedText, /Beschreibung:/);
  assert.match(result.suggestion.suggestedText, /serverseitige Verwaltung der KI-Balance/);
  assert.match(result.suggestion.suggestedText, /Technische Notiz:/);
  assert.match(result.suggestion.suggestedText, /später erweiterbar bleiben/);
  assert.match(result.suggestion.suggestedText, /Akzeptanzkriterien:/);
  assert.match(result.suggestion.suggestedText, /Ein Kriterium/);
});

test('generateBatchFixSuggestions returns missing-finding entries without failing the whole batch', async () => {
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => createAnalysisResult(),
    generateSuggestionWithLlmFn: async () => ({
      provider: 'openai',
      model: 'gpt-4o-mini',
      output: {
        targetField: 'acceptanceCriteria',
        currentText: '',
        suggestedText: '1. A\n2. B\n3. C',
        summary: 'Akzeptanzkriterien ergänzt',
        reasoning: 'Kontextbasiert.',
      },
    }),
  });

  const result = await service.generateBatchFixSuggestions({
    issueKey: 'KAN-41',
    findingIds: ['acceptance_criteria_missing', 'not_available_here'],
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(result.summary.requested, 2);
  assert.equal(result.summary.succeeded, 1);
  assert.equal(result.summary.failed, 1);
  assert.equal(result.suggestions[1].findingId, 'not_available_here');
  assert.equal(result.suggestions[1].error.code, 'FINDING_NOT_AVAILABLE');
});

test('generateSingleFixSuggestion enforces a new paragraph before Beispiel for examples_missing', async () => {
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => ({
      issue: {
        key: 'KAN-41',
        summary: 'Filterverhalten verbessern',
        description: `Beschreibung:
Die Filteroptionen sind aktuell schwer nachvollziehbar.`,
        issueType: { name: 'Story' },
        priority: { name: 'Medium' },
        labels: ['llm'],
        status: { name: 'In Arbeit' },
      },
      activeRulesetIds: ['ai-quality'],
      findings: {
        critical: [
          {
            id: 'examples_missing',
            title: 'Keine konkreten Beispiele',
            description: 'Es fehlen konkrete Beispiele.',
            impact: 'Verhalten schwer nachvollziehbar.',
            severity: 'critical',
            fixable: true,
          },
        ],
        warnings: [],
        fulfilled: [],
      },
    }),
    generateSuggestionWithLlmFn: async () => ({
      provider: 'openai',
      model: 'gpt-4o-mini',
      output: {
        targetField: 'description',
        currentText: '',
        suggestedText: 'Die Filteroptionen muessen ueberarbeitet werden, um die Nutzererfahrung zu verbessern. Beispiel: Ein Nutzer gibt eine Suchanfrage ein und grenzt danach nach Kategorie ein.',
        summary: 'Beispiel ergaenzt',
        reasoning: 'Kontextbasiert.',
      },
    }),
  });

  const result = await service.generateSingleFixSuggestion({
    issueKey: 'KAN-41',
    findingId: 'examples_missing',
    activeRulesetIds: ['ai-quality'],
  });

  assert.equal(result.status, 'completed');
  assert.match(
    result.suggestion.suggestedText,
    /verbessern\.\n\nBeispiel:\s+Ein Nutzer gibt/
  );
});

test('buildFullDescriptionSuggestion preserves trailing sections from the original ticket text', () => {
  const fullSuggestion = __testUtils.buildFullDescriptionSuggestion(
    `Beschreibung:
Alte Einleitung

Technische Notiz:
Vorhandene Notiz

Akzeptanzkriterien:
1. Bereits vorhanden`,
    `Beschreibung:
Neue Einleitung`
  );

  assert.match(fullSuggestion, /Neue Einleitung/);
  assert.match(fullSuggestion, /Technische Notiz:/);
  assert.match(fullSuggestion, /Vorhandene Notiz/);
  assert.match(fullSuggestion, /Akzeptanzkriterien:/);
  assert.match(fullSuggestion, /Bereits vorhanden/);
});

test('generateSingleFixSuggestion supports fixable custom semantic findings', async () => {
  let capturedInput = null;
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => ({
      issue: {
        key: 'KAN-99',
        summary: 'BE-13: Custom Fix',
        description: 'Technische Beschreibung ohne Nutzen.',
        issueType: { name: 'Story' },
        priority: { name: 'Medium' },
        labels: [],
        status: { name: 'In Arbeit' },
      },
      activeRulesetIds: ['custom-fixable-set'],
      findings: {
        critical: [],
        warnings: [
          {
            id: 'custom_rule:custom-fixable-set:rule-sem-fixable',
            title: 'Nutzernutzen klar',
            description: 'Nutzen und Mehrwert muessen klar beschrieben sein.',
            impact: 'Benutzerdefinierte Regel ist aktuell nicht erfuellt.',
            severity: 'warning',
            fixable: true,
            ruleName: 'Nutzernutzen klar',
            ruleIntent: 'Fixable Rules',
            whatShouldBeChecked: 'Nutzen und Mehrwert muessen klar beschrieben sein.',
            ruleExample: 'Nutzen: Der Nutzer kann sich schnell einloggen.',
          },
        ],
        fulfilled: [],
      },
    }),
    generateSuggestionWithLlmFn: async (input) => {
      capturedInput = input;
      return {
        provider: 'openai',
        model: 'gpt-4o-mini',
        output: {
          targetField: 'description',
          currentText: '',
          suggestedText: 'Beschreibung:\nDer Nutzen und Mehrwert fuer Nutzer sind jetzt klar beschrieben.',
          summary: 'Nutzen ergaenzt',
          reasoning: 'Auf Basis der benutzerdefinierten Regel.',
        },
      };
    },
  });

  const result = await service.generateSingleFixSuggestion({
    issueKey: 'KAN-99',
    findingId: 'custom_rule:custom-fixable-set:rule-sem-fixable',
    activeRulesetIds: ['custom-fixable-set'],
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.suggestion.targetField, 'description');
  assert.equal(capturedInput?.finding?.id, 'custom_rule:custom-fixable-set:rule-sem-fixable');
  assert.equal(capturedInput?.finding?.ruleName, 'Nutzernutzen klar');
  assert.equal(capturedInput?.finding?.ruleIntent, 'Fixable Rules');
  // customRule block must be forwarded to LLM
  assert.equal(capturedInput?.customRule?.whatShouldBeChecked, 'Nutzen und Mehrwert muessen klar beschrieben sein.');
  assert.equal(capturedInput?.customRule?.example, 'Nutzen: Der Nutzer kann sich schnell einloggen.');
});

test('generateSingleFixSuggestion enforces bulletpoints for custom rules that demand them', async () => {
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => ({
      issue: {
        key: 'KAN-101',
        summary: 'Login-Button funktioniert nicht',
        description: 'Beim Klick auf den Login-Button passiert nichts. Bitte beheben.',
        issueType: { name: 'Story' },
        priority: { name: 'High' },
        labels: [],
        status: { name: 'Open' },
      },
      activeRulesetIds: ['bullet-set'],
      findings: {
        critical: [],
        warnings: [
          {
            id: 'custom_rule:bullet-set:bullets-rule',
            title: 'Akzeptanzkriterien als Bulletpoints',
            description: 'Pruefe mindestens zwei Akzeptanzkriterien als Bulletpoints.',
            impact: 'Benutzerdefinierte Regel ist aktuell nicht erfuellt.',
            severity: 'warning',
            fixable: true,
            ruleName: 'Akzeptanzkriterien als Bulletpoints',
            ruleIntent: 'Bullet-Ruleset',
            whatShouldBeChecked: 'Pruefe, ob mindestens zwei Akzeptanzkriterien vorhanden sind. Wenn nicht, dann fuege mindestens zwei als Bulletpoints ein.',
            ruleExample: '',
          },
        ],
        fulfilled: [],
      },
    }),
    generateSuggestionWithLlmFn: async () => ({
      provider: 'openai',
      model: 'gpt-4o-mini',
      output: {
        targetField: 'description',
        currentText: '',
        // LLM returns plain prose without bullets — post-processing must fix this
        suggestedText: 'Die Akzeptanzkriterien lauten: Nutzer kann sich einloggen. System zeigt Fehler bei falschem Passwort.',
        summary: 'AC ergaenzt',
        reasoning: 'Auf Basis der benutzerdefinierten Regel.',
      },
    }),
  });

  const result = await service.generateSingleFixSuggestion({
    issueKey: 'KAN-101',
    findingId: 'custom_rule:bullet-set:bullets-rule',
    activeRulesetIds: ['bullet-set'],
  });

  assert.equal(result.status, 'completed');
  const suggestedText = result.suggestion.suggestedText;
  const bulletLines = suggestedText.split('\n').filter(line => /^- \S/.test(line));
  assert.ok(
    bulletLines.length >= 2,
    `Expected at least 2 bullet lines, got ${bulletLines.length}. Text:\n${suggestedText}`
  );
});

test('generateSingleFixSuggestion does not enforce bullets when rule has no bullet demand', async () => {
  const service = createFixSuggestionService({
    analyzeIssueFn: async () => ({
      issue: {
        key: 'KAN-102',
        summary: 'Nutzerwert unklar',
        description: 'Keine klare Beschreibung des Nutzerwerts.',
        issueType: { name: 'Story' },
        priority: { name: 'Medium' },
        labels: [],
        status: { name: 'Open' },
      },
      activeRulesetIds: ['value-set'],
      findings: {
        critical: [],
        warnings: [
          {
            id: 'custom_rule:value-set:value-rule',
            title: 'Nutzerwert beschreiben',
            description: 'Beschreibe den Nutzerwert klar.',
            impact: 'Benutzerdefinierte Regel ist aktuell nicht erfuellt.',
            severity: 'warning',
            fixable: true,
            ruleName: 'Nutzerwert beschreiben',
            ruleIntent: 'Value-Ruleset',
            whatShouldBeChecked: 'Pruefe ob der Nutzerwert klar beschrieben ist.',
            ruleExample: '',
          },
        ],
        fulfilled: [],
      },
    }),
    generateSuggestionWithLlmFn: async () => ({
      provider: 'openai',
      model: 'gpt-4o-mini',
      output: {
        targetField: 'description',
        currentText: '',
        suggestedText: 'Der Nutzerwert ist klar: Nutzer profitieren von schnellerem Login.',
        summary: 'Nutzerwert ergaenzt',
        reasoning: 'Auf Basis der Regel.',
      },
    }),
  });

  const result = await service.generateSingleFixSuggestion({
    issueKey: 'KAN-102',
    findingId: 'custom_rule:value-set:value-rule',
    activeRulesetIds: ['value-set'],
  });

  assert.equal(result.status, 'completed');
  // Post-processing must NOT have converted the prose to bullets
  const suggestedText = result.suggestion.suggestedText;
  const bulletLines = suggestedText.split('\n').filter(line => /^- \S/.test(line));
  assert.equal(bulletLines.length, 0, `Expected no bullet lines, got ${bulletLines.length}. Text:\n${suggestedText}`);
});

test('mapSuggestionResult decodes literal \\n escape sequences in suggested text', () => {
  const { mapSuggestionResult } = __testUtils;
  const issue = { key: 'KAN-99', summary: 'Test', description: 'Existing body.' };
  const finding = { id: 'acceptance_criteria_missing', title: 'Missing AC', description: '', impact: '' };
  const llmResult = {
    provider: 'openai',
    model: 'gpt-4o',
    output: {
      targetField: 'acceptanceCriteria',
      currentText: '',
      suggestedText: 'Beschreibung:\\nDie Middleware läuft.\\n- Punkt A\\n- Punkt B',
      summary: 'AC added',
      reasoning: '',
    },
  };

  const result = mapSuggestionResult({ issueKey: 'KAN-99', issue, finding, llmResult });
  assert.equal(result.status, 'completed');
  assert.ok(
    !result.suggestedText.includes('\\n'),
    `suggestedText should not contain literal \\n but got: ${result.suggestedText}`,
  );
  assert.ok(
    result.suggestedText.includes('\n'),
    'suggestedText should contain real newlines',
  );
});

test('mapSuggestionResult preserves already-real newlines', () => {
  const { mapSuggestionResult } = __testUtils;
  const issue = { key: 'KAN-100', summary: 'Test', description: '' };
  const finding = { id: 'acceptance_criteria_missing', title: 'Missing AC', description: '', impact: '' };
  const realNewlineText = 'Zeile 1\nZeile 2\nZeile 3';
  const llmResult = {
    provider: 'openai',
    model: 'gpt-4o',
    output: {
      targetField: 'acceptanceCriteria',
      currentText: '',
      suggestedText: realNewlineText,
      summary: '',
      reasoning: '',
    },
  };

  const result = mapSuggestionResult({ issueKey: 'KAN-100', issue, finding, llmResult });
  assert.equal(result.status, 'completed');
  const newlineCount = (result.suggestedText.match(/\n/g) ?? []).length;
  assert.ok(newlineCount >= 2, `Expected at least 2 real newlines, got ${newlineCount}`);
});

test('mapSuggestionResult preserves escaped backslashes (does not decode \\\\n as newline)', () => {
  const { mapSuggestionResult } = __testUtils;
  const issue = { key: 'KAN-101', summary: 'Test', description: '' };
  const finding = { id: 'acceptance_criteria_missing', title: 'Missing AC', description: '', impact: '' };
  // The string "a\\nb" — four JS characters: a, \, \, n, b — represents a literal backslash followed by n
  const llmResult = {
    provider: 'openai',
    model: 'gpt-4o',
    output: {
      targetField: 'acceptanceCriteria',
      currentText: '',
      suggestedText: 'a\\\\nb',
      summary: '',
      reasoning: '',
    },
  };

  const result = mapSuggestionResult({ issueKey: 'KAN-101', issue, finding, llmResult });
  assert.equal(result.status, 'completed');
  assert.ok(
    result.suggestedText.includes('\\n'),
    `Expected literal \\n to be preserved, got: ${result.suggestedText}`,
  );
  assert.ok(
    !result.suggestedText.split('\\\\').some(f => f.includes('\n')),
    'Should not have introduced an unexpected real newline',
  );
});
