import { getNormalizedIssue } from './issue-service.js';
import { getRulesetsState, DEFAULT_ACTIVE_RULESET_IDS } from './ruleset-service.js';
import { assistAnalysisWithLlm } from './llm-service.js';
import {
  RULE_DEFINITIONS,
  RULE_EVALUATOR_TYPES,
  RULESET_RULE_IDS,
  SEMANTIC_EVALUATION_STATUSES,
} from '../domain/analysis/rule-definitions.js';
import {
  isPreservedDescriptionSectionHeading,
} from '../domain/shared/description-sections.js';
import { logError, logInfo } from '../utils/logger.js';
import { mapWithConcurrency } from '../utils/concurrency.js';

/**
 * Ein einzelnes Beweismittel, das einem semantischen Auswertungsergebnis beigefügt ist.
 * @typedef {Object} EvidenceEntry
 * @property {string} type         - Art des Beweismittels: 'matched_marker' | 'matched_sentence' | 'missing_description_body' | 'llm_error' | etc.
 * @property {string} [text]       - Auszug oder gefundener Text, falls zutreffend.
 * @property {string} [source]     - Ursprung des Beweismittels ('heuristic' | 'llm').
 */

/**
 * Ergebnis der Auswertung einer semantischen Regel (Stufe-A-Heuristik oder Stufe-B-LLM-Override).
 * @typedef {Object} SemanticEvaluationResult
 * @property {'pass' | 'fail' | 'not_testable'} status
 * @property {string} scope         - Welcher Teil des Issues ausgewertet wurde ('main_description' | 'title' | etc.).
 * @property {EvidenceEntry[]} evidence
 */

/**
 * Ergebnis der Regelauswertung für ein einzelnes Jira-Issue.
 * @typedef {Object} Finding
 * @property {string} id
 * @property {string} ruleId
 * @property {string} rulesetId
 * @property {import('../domain/analysis/rule-definitions.js').RuleEvaluatorType} evaluatorType
 * @property {import('../domain/analysis/rule-definitions.js').SemanticEvaluationContract | null} semanticEvaluationContract
 * @property {string} title
 * @property {'fulfilled' | 'critical' | 'warning' | 'info'} severity
 * @property {string} description
 * @property {string} impact
 * @property {boolean} fixable
 * @property {SemanticEvaluationResult | null} [semanticEvaluation]
 * @property {string} [ruleName]              - Vorhanden bei Custom-Rule-Findings.
 * @property {string} [ruleIntent]            - Vorhanden bei Custom-Rule-Findings (Regelset-Name).
 * @property {string} [whatShouldBeChecked]   - Vorhanden bei Custom-Rule-Findings.
 * @property {'critical' | 'warning'} [customRuleSeverity] - Konfigurierter Schweregrad bei Custom-Rule-Findings.
 * @property {string} [customRuleScope]       - Bereich bei der heuristischen Auswertung von Custom Rules.
 */

/**
 * Nach Schweregrad-Bucket gruppierte Findings.
 * @typedef {Object} GroupedFindings
 * @property {Finding[]} critical
 * @property {Finding[]} warnings
 * @property {Finding[]} info
 * @property {Finding[]} fulfilled
 */

/**
 * Das synchrone Analyseergebnis, das von runRulesetAnalysis zurückgegeben wird.
 * @typedef {Object} AnalysisResult
 * @property {object} issue               - Normalisiertes Jira-Issue.
 * @property {string[]} activeRulesetIds
 * @property {number} score               - Qualitätsscore von 0–100.
 * @property {object} summary             - Menschenlesbare Aufschlüsselung der Zählungen.
 * @property {GroupedFindings} findings
 * @property {object} metadata
 * @property {string[]} metadata.evaluatedRuleIds
 * @property {string} metadata.engine
 * @property {string} metadata.cacheKeyFingerprint
 * @property {string} metadata.analysisInputFingerprint
 */

function normalizeWhitespace(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(entry => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function buildCacheKeyFingerprint(issue, activeRulesetIds) {
  const fingerprintPayload = {
    issue: {
      key: issue?.key ?? null,
      summary: issue?.summary ?? null,
      description: issue?.description ?? null,
      issueTypeName: issue?.issueType?.name ?? null,
      priorityName: issue?.priority?.name ?? null,
      statusName: issue?.status?.name ?? null,
      labels: Array.isArray(issue?.labels) ? [...issue.labels].sort() : [],
      estimateSeconds: issue?.estimate?.seconds ?? null,
      estimateDisplay: issue?.estimate?.display ?? null,
    },
    activeRulesetIds: Array.isArray(activeRulesetIds) ? [...activeRulesetIds] : [],
  };

  return hashString(stableStringify(fingerprintPayload));
}

function buildAnalysisInputFingerprint(issue, activeRulesetIds, customRulesets) {
  const normalizedCustomRulesets = Array.isArray(customRulesets)
    ? customRulesets.map(ruleset => ({
        id: ruleset?.id ?? null,
        name: ruleset?.name ?? null,
        appliesTo: Array.isArray(ruleset?.appliesTo) ? [...ruleset.appliesTo] : [],
        rules: Array.isArray(ruleset?.rules)
          ? ruleset.rules.map(rule => ({
              id: rule?.id ?? null,
              name: rule?.name ?? null,
              checkDescription: rule?.checkDescription ?? null,
              severity: rule?.severity ?? null,
              example: rule?.example ?? null,
              evaluatorType: rule?.evaluatorType ?? null,
              scope: rule?.scope ?? null,
            }))
          : [],
      }))
    : [];

  return hashString(stableStringify({
    cacheKeyFingerprint: buildCacheKeyFingerprint(issue, activeRulesetIds),
    customRulesets: normalizedCustomRulesets,
  }));
}

function lowerCaseText(value) {
  return normalizeWhitespace(value).toLowerCase();
}

function getCombinedIssueText(issue) {
  return lowerCaseText(`${issue.summary ?? ''}\n${issue.description ?? ''}`);
}

function getTrimmedAcceptanceCriteriaLines(issue) {
  return String(issue.acceptanceCriteria ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

// PRESERVED_DESCRIPTION_SECTION_PATTERNS und isPreservedDescriptionSectionHeading
// werden jetzt aus ../domain/shared/description-sections.js importiert

function getPrimaryDescriptionText(issue) {
  const lines = String(issue.description ?? '').split('\n');
  const preservedSectionIndex = lines.findIndex(isPreservedDescriptionSectionHeading);

  if (preservedSectionIndex < 0) {
    return lowerCaseText(issue.description ?? '');
  }

  return lowerCaseText(lines.slice(0, preservedSectionIndex).join('\n'));
}

function getDescriptionSentences(text) {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function looksLikeCriteriaContent(line) {
  const normalizedLine = line.trim();

  if (!normalizedLine) {
    return false;
  }

  return (
    /^[-*•✓]/.test(normalizedLine) ||
    /^\d+[.)]/.test(normalizedLine) ||
    /^\[[ xX]\]/.test(normalizedLine) ||
    normalizedLine.length >= 20
  );
}

function hasAcceptanceCriteria(issue) {
  const acceptanceCriteria = lowerCaseText(issue.acceptanceCriteria ?? '');

  if (!acceptanceCriteria) {
    logInfo('analysis.acceptance_criteria.evaluated', {
      issueKey: issue.key,
      hasAcceptanceCriteriaField: false,
      hasStructuredContent: false,
      hasGivenWhenThen: false,
      result: false,
    });
    return false;
  }

  const acceptanceCriteriaLines = getTrimmedAcceptanceCriteriaLines(issue);
  const hasStructuredContent = acceptanceCriteriaLines.some(looksLikeCriteriaContent);
  const hasGivenWhenThen =
    acceptanceCriteria.includes('given') &&
    acceptanceCriteria.includes('when') &&
    acceptanceCriteria.includes('then');
  const result = hasStructuredContent || hasGivenWhenThen;

  logInfo('analysis.acceptance_criteria.evaluated', {
    issueKey: issue.key,
    hasAcceptanceCriteriaField: true,
    hasStructuredContent,
    hasGivenWhenThen,
    acceptanceCriteriaLineCount: acceptanceCriteriaLines.length,
    acceptanceCriteriaPreview: acceptanceCriteriaLines.slice(0, 4),
    result,
  });

  return result;
}

function buildSemanticEvidence(type, detail) {
  return {
    type,
    detail,
  };
}

function evaluateUserValueSemantics(issue) {
  const primaryDescription = getPrimaryDescriptionText(issue);

  if (!primaryDescription) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
      scope: 'main_description',
      evidence: [buildSemanticEvidence('missing_description_body', 'Kein primärer Beschreibungstext vorhanden.')],
    };
  }

  const descriptionSentences = getDescriptionSentences(primaryDescription);
  const matchedMarkers = [
    ['nutzen:', primaryDescription.includes('nutzen:')],
    ['user value:', primaryDescription.includes('user value:')],
    ['mehrwert:', primaryDescription.includes('mehrwert:')],
    ['damit', getCombinedIssueText(issue).includes(' damit ') || getCombinedIssueText(issue).startsWith('damit ')],
    ['sodass', getCombinedIssueText(issue).includes(' sodass ')],
    ['so dass', getCombinedIssueText(issue).includes(' so dass ')],
    ['so that', getCombinedIssueText(issue).includes(' so that ')],
    ['in order to', getCombinedIssueText(issue).includes(' in order to ')],
  ]
    .filter(([, matched]) => matched)
    .map(([marker]) => buildSemanticEvidence('matched_marker', marker));
  const purposeSentence = descriptionSentences.find(sentence => /\bum\b.+\bzu\b/.test(sentence));

  if (matchedMarkers.length > 0 || purposeSentence) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.PASS,
      scope: 'main_description',
      evidence: [
        ...matchedMarkers,
        ...(purposeSentence
          ? [buildSemanticEvidence('matched_sentence', purposeSentence)]
          : []),
      ],
    };
  }

  return {
    status: SEMANTIC_EVALUATION_STATUSES.FAIL,
    scope: 'main_description',
    evidence: [buildSemanticEvidence('matched_sentence', 'Kein explizites Wert- oder Zweck-Statement gefunden.')],
  };
}

function evaluateExamplesSemantics(issue) {
  const description = getPrimaryDescriptionText(issue);

  if (!description) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
      scope: 'main_description',
      evidence: [buildSemanticEvidence('missing_description_body', 'Kein primärer Beschreibungstext vorhanden.')],
    };
  }

  const descriptionSentences = getDescriptionSentences(description);
  const matchedMarkers = [
    ['beispiel', description.includes('beispiel')],
    ['zum beispiel', description.includes('zum beispiel')],
    ['z.b.', description.includes('z.b.')],
    ['z. b.', description.includes('z. b.')],
    ['example', description.includes('example')],
    ['given-when-then', description.includes('given') && description.includes('when') && description.includes('then')],
  ]
    .filter(([, matched]) => matched)
    .map(([marker]) => buildSemanticEvidence('matched_marker', marker));
  const scenarioSentence = descriptionSentences.find(sentence =>
    /^wenn\b.+/.test(sentence) || /^when\b.+/.test(sentence)
  );

  if (matchedMarkers.length > 0 || scenarioSentence) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.PASS,
      scope: 'main_description',
      evidence: [
        ...matchedMarkers,
        ...(scenarioSentence
          ? [buildSemanticEvidence('matched_sentence', scenarioSentence)]
          : []),
      ],
    };
  }

  return {
    status: SEMANTIC_EVALUATION_STATUSES.FAIL,
    scope: 'main_description',
    evidence: [buildSemanticEvidence('matched_sentence', 'Kein konkretes Beispiel oder Szenario gefunden.')],
  };
}

function hasEstimate(issue) {
  return Boolean(issue.estimate?.seconds && issue.estimate.seconds > 0);
}

function hasPriority(issue) {
  return Boolean(issue?.priority?.name);
}

function createFinding(rule, overrides = {}) {
  return {
    id: rule.id,
    ruleId: rule.id,
    rulesetId: rule.rulesetId,
    evaluatorType: rule.evaluatorType,
    semanticEvaluationContract: rule.semanticEvaluationContract ?? null,
    title: rule.title,
    severity: rule.severity,
    description: rule.description,
    impact: rule.impact,
    fixable: rule.fixable,
    ...overrides,
  };
}

function getActiveCustomRules(activeRulesetIds, customRulesets) {
  if (!Array.isArray(customRulesets) || customRulesets.length === 0) {
    return [];
  }

  const activeRulesetIdSet = new Set(Array.isArray(activeRulesetIds) ? activeRulesetIds : []);

  return customRulesets
    .filter(ruleset => activeRulesetIdSet.has(ruleset.id))
    .flatMap(ruleset => {
      const rules = Array.isArray(ruleset.rules) ? ruleset.rules : [];

      return rules.map(rule => ({
        ruleset,
        rule,
      }));
    });
}

const CUSTOM_RULE_KEYWORD_STOPWORDS = new Set([
  'und', 'oder', 'der', 'die', 'das', 'ein', 'eine', 'einer', 'einem',
  'fuer', 'für', 'mit', 'ohne', 'wenn', 'dann', 'soll', 'sollen', 'muss', 'muessen', 'müssen',
  'check', 'regel', 'ticket', 'beschreibung', 'story', 'user',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'must', 'should',
]);

function extractRuleKeywords(rule) {
  const sourceText = lowerCaseText(`${rule?.name ?? ''} ${rule?.checkDescription ?? ''}`);

  if (!sourceText) {
    return [];
  }

  return [...new Set(
    sourceText
      .split(/[^a-z0-9äöüß]+/i)
      .map(token => token.trim())
      .filter(token => token.length >= 4 && !CUSTOM_RULE_KEYWORD_STOPWORDS.has(token))
  )];
}

function isTitleQualityRule(rule) {
  const sourceText = lowerCaseText(`${rule?.name ?? ''} ${rule?.checkDescription ?? ''}`);
  return sourceText.includes('titel') || sourceText.includes('title');
}

function evaluateCustomTitleRule(issue) {
  const title = normalizeWhitespace(issue?.summary ?? '');

  if (!title) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.FAIL,
      scope: 'title',
      evidence: [buildSemanticEvidence('missing_title', 'Titel fehlt oder ist leer.')],
    };
  }

  const normalizedTitle = lowerCaseText(title);
  const genericTitles = new Set([
    'test',
    'ticket',
    'bugfix',
    'fix',
    'update',
    'task',
    'story',
    'issue',
    'wip',
  ]);

  const isTooShort = title.length < 12;
  const isGeneric = genericTitles.has(normalizedTitle);

  if (isTooShort || isGeneric) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.FAIL,
      scope: 'title',
      evidence: [
        buildSemanticEvidence(
          'generic_title',
          'Titel wirkt zu kurz oder zu allgemein. Bitte konkreter benennen.'
        ),
      ],
    };
  }

  return {
    status: SEMANTIC_EVALUATION_STATUSES.PASS,
    scope: 'title',
    evidence: [buildSemanticEvidence('title_quality', 'Titel wirkt konkret und ausreichend spezifisch.')],
  };
}

function resolveCustomRuleScope(rule, evaluatorType) {
  const explicitScope = typeof rule?.scope === 'string' ? rule.scope : 'auto';

  if (explicitScope === 'title' || explicitScope === 'main_description' || explicitScope === 'full_description') {
    return explicitScope;
  }

  if (isTitleQualityRule(rule)) {
    return 'title';
  }

  if (evaluatorType === RULE_EVALUATOR_TYPES.DETERMINISTIC) {
    return 'full_description';
  }

  return 'main_description';
}

function getScopedIssueText(issue, scope) {
  if (scope === 'title') {
    return lowerCaseText(issue?.summary ?? '');
  }

  if (scope === 'full_description') {
    return lowerCaseText(issue?.description ?? '');
  }

  return getPrimaryDescriptionText(issue);
}

function evaluateCustomRuleDeterministic(rule, issue, scope) {
  if (isTitleQualityRule(rule)) {
    return evaluateCustomTitleRule(issue);
  }

  const marker = normalizeWhitespace(rule?.example ?? '');
  const issueText = getScopedIssueText(issue, scope);
  const fallbackKeywords = extractRuleKeywords(rule);

  if (marker) {
    const normalizedMarker = lowerCaseText(marker);
    const isMatched = issueText.includes(normalizedMarker);

    return {
      status: isMatched ? SEMANTIC_EVALUATION_STATUSES.PASS : SEMANTIC_EVALUATION_STATUSES.FAIL,
      scope,
      evidence: [
        buildSemanticEvidence(
          isMatched ? 'matched_marker' : 'missing_marker',
          `Deterministischer Marker "${marker}" ${isMatched ? 'gefunden' : 'nicht gefunden'}.`
        ),
      ],
    };
  }

  if (fallbackKeywords.length === 0) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
      scope,
      evidence: [
        buildSemanticEvidence(
          'missing_deterministic_marker',
          'Kein deterministischer Marker und keine auswertbaren Schluesselwoerter vorhanden.'
        ),
      ],
    };
  }

  const matchedKeywords = fallbackKeywords.filter(keyword => issueText.includes(keyword));
  const isMatched = matchedKeywords.length > 0;

  return {
    status: isMatched ? SEMANTIC_EVALUATION_STATUSES.PASS : SEMANTIC_EVALUATION_STATUSES.FAIL,
    scope,
    evidence: [
      buildSemanticEvidence(
        isMatched ? 'matched_keywords' : 'missing_keywords',
        `Deterministische Regelpruefung per Schluesselwoerter: ${matchedKeywords.join(', ') || 'Keine Treffer'}.`
      ),
      buildSemanticEvidence('keyword_basis', fallbackKeywords.join(', ')),
    ],
  };
}

function evaluateCustomRuleSemanticHeuristic(rule, issue, scope) {
  const scopedText = getScopedIssueText(issue, scope);

  if (!scopedText) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
      scope,
      evidence: [buildSemanticEvidence('missing_description_body', 'Kein auswertbarer Text für den konfigurierten Bereich.')],
    };
  }

  const keywords = extractRuleKeywords(rule);

  if (keywords.length === 0) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
      scope,
      evidence: [
        buildSemanticEvidence(
          'missing_rule_keywords',
          'Die Regelbeschreibung liefert keine ausreichend klaren Schluesselwoerter.'
        ),
      ],
    };
  }

  const matchedKeywords = keywords.filter(keyword => scopedText.includes(keyword));
  const isPass = matchedKeywords.length >= Math.min(2, keywords.length);

  return {
    status: isPass ? SEMANTIC_EVALUATION_STATUSES.PASS : SEMANTIC_EVALUATION_STATUSES.FAIL,
    scope,
    evidence: [
      buildSemanticEvidence('matched_keywords', matchedKeywords.join(', ') || 'Keine Treffer'),
      buildSemanticEvidence('keyword_basis', keywords.join(', ')),
    ],
  };
}

function isDescriptionDependentScope(scope) {
  return scope === 'main_description' || scope === 'full_description';
}

function hasEvaluableDescription(issue) {
  return normalizeWhitespace(issue?.description ?? '').length > 0;
}

function evaluateCustomRule(rule, ruleset, issue) {
  const evaluatorType = rule?.evaluatorType ?? RULE_EVALUATOR_TYPES.SEMANTIC_LLM;
  const scope = resolveCustomRuleScope(rule, evaluatorType);

  // A rule whose scope targets the description cannot be evaluated when the
  // ticket has no description at all. Short-circuiting here keeps both the
  // deterministic path and the LLM path from guessing a fail verdict against
  // an empty input.
  if (isDescriptionDependentScope(scope) && !hasEvaluableDescription(issue)) {
    return {
      status: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
      scope,
      evidence: [
        buildSemanticEvidence(
          'missing_description_body',
          'Das Ticket hat keine Beschreibung. Die Regel kann daher nicht geprueft werden.'
        ),
      ],
    };
  }

  if (evaluatorType === RULE_EVALUATOR_TYPES.DETERMINISTIC) {
    return evaluateCustomRuleDeterministic(rule, issue, scope);
  }

  if (evaluatorType === RULE_EVALUATOR_TYPES.SEMANTIC_LLM) {
    return evaluateCustomRuleSemanticHeuristic(rule, issue, scope);
  }

  return {
    status: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
    scope: 'full_description',
    evidence: [
      buildSemanticEvidence(
        'custom_rule_not_automated',
        `Evaluator-Typ "${evaluatorType}" ist im Regelwerk "${ruleset.name}" noch nicht automatisiert.`
      ),
    ],
  };
}

function createCustomRuleFinding({ ruleset, rule, issue }) {
  const customFindingId = `custom_rule:${ruleset.id}:${rule.id}`;
  const evaluation = evaluateCustomRule(rule, ruleset, issue);
  const isSemanticLlmRule = rule.evaluatorType === RULE_EVALUATOR_TYPES.SEMANTIC_LLM;
  const isFailingRule = evaluation.status === SEMANTIC_EVALUATION_STATUSES.FAIL;
  const failureSeverity = rule.severity === 'critical' ? 'critical' : 'warning';
  const resolvedSeverity =
    evaluation.status === SEMANTIC_EVALUATION_STATUSES.PASS
      ? 'fulfilled'
      : evaluation.status === SEMANTIC_EVALUATION_STATUSES.FAIL
        ? failureSeverity
        : 'info';
  const resolvedImpact =
    evaluation.status === SEMANTIC_EVALUATION_STATUSES.PASS
      ? 'Benutzerdefinierte Regel ist erfuellt.'
      : evaluation.status === SEMANTIC_EVALUATION_STATUSES.FAIL
        ? 'Benutzerdefinierte Regel ist aktuell nicht erfuellt.'
        : 'Benutzerdefinierte Regel konnte nicht verlaesslich geprueft werden.';

  return {
    id: customFindingId,
    ruleId: customFindingId,
    rulesetId: ruleset.id,
    evaluatorType: rule.evaluatorType,
    semanticEvaluationContract: null,
    ruleName: rule.name,
    ruleIntent: ruleset.name,
    whatShouldBeChecked: rule.checkDescription,
    ruleExample: rule.example ?? '',
    title: rule.name,
    severity: resolvedSeverity,
    customRuleSeverity: rule.severity === 'critical' ? 'critical' : 'warning',
    customRuleScope: evaluation.scope,
    description: rule.checkDescription,
    impact: resolvedImpact,
    fixable: isSemanticLlmRule && isFailingRule,
    semanticEvaluation: evaluation,
  };
}

function getFailureSeverityFromFinding(finding) {
  return finding?.customRuleSeverity === 'critical' ? 'critical' : 'warning';
}

function mapLlmRecommendationToSemanticStatus(recommendation) {
  const severity = String(recommendation?.severity ?? '').toLowerCase();
  const rationale = String(recommendation?.rationale ?? '').toLowerCase();

  // Ein 'fulfilled'-Urteil ist immer ein PASS – Begründungstext kann ein klares
  // positives Signal nicht herabstufen. Ohne diesen Schutz würde eine Nebenaussage wie
  // „…nicht immer testbar, hier aber erfüllt" ein korrektes PASS-Ergebnis still löschen.
  if (severity === 'fulfilled') {
    return SEMANTIC_EVALUATION_STATUSES.PASS;
  }

  // Explizites not_testable in der Begründung hat Vorrang vor einem Fail-Schweregrad:
  // Das LLM signalisiert unzureichende Belege statt eines echten Fehlers.
  if (rationale.includes('not_testable') || rationale.includes('not testable')) {
    return SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE;
  }

  if (severity === 'critical' || severity === 'warning') {
    return SEMANTIC_EVALUATION_STATUSES.FAIL;
  }

  return SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE;
}

function normalizeIdentifier(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function pickRecommendationForFinding(finding, llmResult) {
  const recommendations = Array.isArray(llmResult?.output?.recommendations)
    ? llmResult.output.recommendations
    : [];

  if (recommendations.length === 0) {
    return {
      recommendation: null,
      reason: 'no_recommendations',
    };
  }

  const findingId = normalizeIdentifier(finding?.id);
  const byExactRuleId = recommendations.find(
    recommendation => normalizeIdentifier(recommendation?.ruleId) === findingId
  );
  if (byExactRuleId) {
    return {
      recommendation: byExactRuleId,
      reason: 'matched_by_rule_id',
    };
  }

  // Wenn genau eine Empfehlung vorhanden ist und deren ruleId leer/null ist,
  // Rückwärtskompatibilität beibehalten und sie verwenden (LLM hat die ID einfach weggelassen).
  // Wenn die ruleId explizit gesetzt ist, aber nicht übereinstimmt, gehört sie zu
  // einer anderen Regel und darf hier nicht angewendet werden.
  if (recommendations.length === 1) {
    const singleRuleId = normalizeIdentifier(recommendations[0]?.ruleId);
    const hasExplicitMismatch = singleRuleId.length > 0 && singleRuleId !== findingId;

    if (hasExplicitMismatch) {
      return {
        recommendation: null,
        reason: 'single_recommendation_explicit_mismatch',
      };
    }

    return {
      recommendation: recommendations[0],
      reason: 'single_recommendation_fallback',
    };
  }

  // Mehrere Empfehlungen ohne exakte Rule-ID-Übereinstimmung sind für diese spezifische Regel mehrdeutig.
  return {
    recommendation: null,
    reason: 'ambiguous_recommendations',
  };
}

function buildCustomSemanticContractEvidence({
  finding,
  recommendation,
  mappingReason,
  semanticStatus,
  reasonCode = null,
  fallbackMessage = null,
}) {
  const safeFinding = finding ?? {};
  const statusValue = semanticStatus ?? SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE;
  const message =
    fallbackMessage ??
    recommendation?.rationale ??
    'LLM-Bewertung war nicht eindeutig testbar oder nicht eindeutig dieser Regel zuzuordnen.';

  return [
    buildSemanticEvidence(
      'custom_semantic_contract',
      `status=${statusValue}; findingId=${safeFinding.id ?? 'unknown'}; match=${mappingReason ?? 'unknown'}; reason=${reasonCode ?? 'none'}`
    ),
    buildSemanticEvidence('llm_rationale', message),
  ];
}

function resolveCustomSemanticLlmContractOutcome(finding, llmResult) {
  const selection = pickRecommendationForFinding(finding, llmResult);
  const recommendation = selection.recommendation;
  const mappingReason = selection.reason;
  const semanticStatus = mapLlmRecommendationToSemanticStatus(recommendation);

  if (!recommendation) {
    return {
      semanticStatus: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
      recommendation: null,
      mappingReason,
      reasonCode:
          mappingReason === 'no_recommendations'
            ? 'missing_recommendation'
            : mappingReason === 'single_recommendation_explicit_mismatch'
              ? 'single_recommendation_explicit_mismatch'
              : 'ambiguous_recommendation_set',
      evidence: buildCustomSemanticContractEvidence({
        finding,
        recommendation: null,
        mappingReason,
        semanticStatus: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
        reasonCode:
          mappingReason === 'no_recommendations'
            ? 'missing_recommendation'
            : mappingReason === 'single_recommendation_explicit_mismatch'
              ? 'single_recommendation_explicit_mismatch'
              : 'ambiguous_recommendation_set',
      }),
    };
  }

  const normalizedSeverity = String(recommendation?.severity ?? '').trim().toLowerCase();
  const hasExpectedSeverity = ['fulfilled', 'critical', 'warning'].includes(normalizedSeverity);

  if (!hasExpectedSeverity) {
    return {
      semanticStatus: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
      recommendation,
      mappingReason,
      reasonCode: 'invalid_recommendation_severity',
      evidence: buildCustomSemanticContractEvidence({
        finding,
        recommendation,
        mappingReason,
        semanticStatus: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
        reasonCode: 'invalid_recommendation_severity',
      }),
    };
  }

  if (semanticStatus === SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE) {
    return {
      semanticStatus,
      recommendation,
      mappingReason,
      reasonCode: 'explicit_not_testable',
      evidence: buildCustomSemanticContractEvidence({
        finding,
        recommendation,
        mappingReason,
        semanticStatus,
        reasonCode: 'explicit_not_testable',
      }),
    };
  }

  return {
    semanticStatus,
    recommendation,
    mappingReason,
    reasonCode: null,
    evidence: buildCustomSemanticContractEvidence({
      finding,
      recommendation,
      mappingReason,
      semanticStatus,
    }),
  };
}

function createCustomSemanticLlmAssistInput(analysisIssue, finding) {
  const safeFinding = finding ?? {};
  const evaluationScope =
    safeFinding.semanticEvaluation?.scope ??
    safeFinding.customRuleScope ??
    'main_description';
  const scopedText = getScopedIssueText(analysisIssue, evaluationScope);

  return {
    issueKey: analysisIssue?.key ?? null,
    issueContext: {
      title: analysisIssue?.summary ?? null,
      summary: analysisIssue?.summary ?? null,
      description: analysisIssue?.description ?? null,
      issueType: analysisIssue?.issueType?.name ?? null,
      priority: analysisIssue?.priority?.name ?? null,
      labels: analysisIssue?.labels ?? [],
      status: analysisIssue?.status?.name ?? null,
    },
    evaluatorMode: 'custom_semantic_llm_rule',
    customRule: {
      id: safeFinding.id ?? null,
      name: safeFinding.ruleName ?? safeFinding.title ?? null,
      intent: safeFinding.ruleIntent ?? null,
      whatShouldBeChecked: safeFinding.whatShouldBeChecked ?? safeFinding.description ?? null,
      failureSeverity: getFailureSeverityFromFinding(safeFinding),
      scope: evaluationScope,
      scopedText,
    },
    instruction:
      'Werte nur diese eine benutzerdefinierte semantische Regel gegen das gegebene Jira-Issue und den angegebenen Regelbereich aus. Gib genau eine Empfehlung zurück und setze recommendation.ruleId auf customRule.id. Verwende Schweregrad "fulfilled" wenn die Regel erfüllt ist, "critical" oder "warning" wenn sie nicht erfüllt ist. Wenn die Belege für den konfigurierten Bereich unzureichend sind, füge "not_testable" in die Begründung ein.',
  };
}

// Nicht-abschließende Reason-Codes zeigen an, dass der LLM-Vertrag kein verwertbares Urteil
// produziert hat (z. B. mehrdeutiges Multi-Empfehlungsset, explizite ruleId-Abweichung,
// fehlende Empfehlungen, ungültiger Schweregrad). In diesen Fällen wird das
// Stufe-A-Heuristik-Ergebnis beibehalten – ein deterministisches Keyword-Signal ist
// besser als ein nichtssagender info/not_testable-Eintrag.
const INCONCLUSIVE_LLM_REASON_CODES = new Set([
  'missing_recommendation',
  'ambiguous_recommendation_set',
  'single_recommendation_explicit_mismatch',
  'invalid_recommendation_severity',
]);

function applyLlmEvaluationToFinding(finding, llmResult) {
  const safeFinding = finding ?? {};
  const outcome = resolveCustomSemanticLlmContractOutcome(safeFinding, llmResult);
  const semanticStatus = outcome.semanticStatus;
  const failureSeverity = getFailureSeverityFromFinding(safeFinding);
  const evaluationScope =
    safeFinding.semanticEvaluation?.scope ??
    safeFinding.customRuleScope ??
    'main_description';

  if (semanticStatus === SEMANTIC_EVALUATION_STATUSES.PASS) {
    return {
      ...safeFinding,
      severity: 'fulfilled',
      fixable: false,
      impact: 'Benutzerdefinierte Regel ist erfuellt.',
      semanticEvaluation: {
        status: SEMANTIC_EVALUATION_STATUSES.PASS,
        scope: evaluationScope,
        evidence: outcome.evidence,
      },
    };
  }

  if (semanticStatus === SEMANTIC_EVALUATION_STATUSES.FAIL) {
    return {
      ...safeFinding,
      severity: failureSeverity,
      fixable: true,
      impact: 'Benutzerdefinierte Regel ist aktuell nicht erfuellt.',
      semanticEvaluation: {
        status: SEMANTIC_EVALUATION_STATUSES.FAIL,
        scope: evaluationScope,
        evidence: outcome.evidence,
      },
    };
  }

  // NOT_TESTABLE: Stufe-A-Heuristik-Ergebnis bei nicht-abschließenden LLM-Verträgen beibehalten.
  // Nur explicit_not_testable (LLM signalisiert bewusst „nicht genug Belege") darf
  // die Heuristik überschreiben – alle anderen nicht-abschließenden Pfade lassen das Finding unverändert.
  if (outcome.reasonCode && INCONCLUSIVE_LLM_REASON_CODES.has(outcome.reasonCode)) {
    const existingEvidence = safeFinding.semanticEvaluation?.evidence ?? [];
    return {
      ...safeFinding,
      semanticEvaluation: {
        ...safeFinding.semanticEvaluation,
        scope: evaluationScope,
        evidence: [...existingEvidence, ...outcome.evidence],
      },
    };
  }

  return {
    ...safeFinding,
    severity: 'info',
    fixable: false,
    impact: 'Benutzerdefinierte Regel konnte nicht verlaesslich geprueft werden.',
    semanticEvaluation: {
      status: SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE,
      scope: evaluationScope,
      evidence: outcome.evidence,
    },
  };
}

async function runSemanticLlmEvaluationForCustomFinding({
  analysisIssue,
  finding,
  accountId,
  installationId,
  assistAnalysisWithLlmFn,
}) {
  const evaluationStartedAtMs = Date.now();
  try {
    const llmResult = await assistAnalysisWithLlmFn(
      createCustomSemanticLlmAssistInput(analysisIssue, finding),
      {
        accountId,
        installationId,
        action: 'semantic_rule_evaluation',
        issueKey: analysisIssue?.key ?? null,
        findingId: finding.id,
      }
    );

    const updatedFinding = applyLlmEvaluationToFinding(finding, llmResult);
    const outcomeStatus = updatedFinding?.semanticEvaluation?.status ?? null;
    // A finding whose severity and status are unchanged after a successful LLM call
    // went through an inconclusive contract path (heuristic preserved).
    const heuristicPreserved =
      updatedFinding.severity === finding.severity &&
      outcomeStatus === (finding?.semanticEvaluation?.status ?? null);

    logInfo('analysis.semantic_rule.timing', {
      issueKey: analysisIssue?.key ?? null,
      findingId: finding.id,
      evaluatorType: finding.evaluatorType ?? null,
      durationMs: Date.now() - evaluationStartedAtMs,
      status: outcomeStatus,
    });

    if (heuristicPreserved) {
      logInfo('analysis.custom_semantic_llm.contract_outcome', {
        issueKey: analysisIssue?.key ?? null,
        findingId: finding.id,
        semanticStatus: outcomeStatus,
        preserved: true,
      });
    }

    return updatedFinding;
  } catch (error) {
    logError('analysis.custom_semantic_llm.failed', error, {
      issueKey: analysisIssue?.key ?? null,
      findingId: finding.id,
      durationMs: Date.now() - evaluationStartedAtMs,
    });

    // Stufe-A-Heuristik-Ergebnis bei LLM-Fehler beibehalten, statt es durch einen
    // generischen info/not_testable-Eintrag zu ersetzen. Evidence wird erweitert,
    // damit der Fehler in der UI sichtbar ist, ohne das Heuristik-Urteil zu verlieren.
    const existingEvidence = finding?.semanticEvaluation?.evidence ?? [];
    return {
      ...finding,
      semanticEvaluation: {
        ...finding?.semanticEvaluation,
        scope:
          finding?.semanticEvaluation?.scope ??
          finding?.customRuleScope ??
          'main_description',
        evidence: [
          ...existingEvidence,
          buildSemanticEvidence(
            'llm_error',
            error instanceof Error
              ? `LLM-Auswertung nicht verfuegbar: ${error.message}`
              : 'LLM-Auswertung nicht verfuegbar.'
          ),
        ],
      },
    };
  }
}

function isNotTestableDueToMissingDescription(finding) {
  const evaluation = finding?.semanticEvaluation;
  if (evaluation?.status !== SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE) {
    return false;
  }

  return (Array.isArray(evaluation.evidence) ? evaluation.evidence : [])
    .some(entry => entry?.type === 'missing_description_body');
}

function collectCustomSemanticLlmFindings(analysis) {
  const allFindings = [
    ...(analysis.findings?.critical ?? []),
    ...(analysis.findings?.warnings ?? []),
    ...(analysis.findings?.info ?? []),
    ...(analysis.findings?.fulfilled ?? []),
  ];

  return allFindings.filter(
    finding =>
      finding?.evaluatorType === RULE_EVALUATOR_TYPES.SEMANTIC_LLM &&
      String(finding?.id ?? '').startsWith('custom_rule:') &&
      // Das LLM nicht bitten, eine Regel neu auszuwerten, deren Quelltext fehlt –
      // es würde sonst nur ein Urteil gegen eine leere Eingabe raten.
      !isNotTestableDueToMissingDescription(finding)
  );
}

export async function applySemanticLlmEvaluationsToAnalysis(
  analysis,
  { accountId = null, installationId = null, assistAnalysisWithLlmFn = assistAnalysisWithLlm } = {}
) {
  const semanticStartedAtMs = Date.now();
  const targets = collectCustomSemanticLlmFindings(analysis);

  if (targets.length === 0) {
    logInfo('analysis.semantic_evaluation.timing', {
      issueKey: analysis?.issue?.key ?? null,
      targetCount: 0,
      durationMs: Date.now() - semanticStartedAtMs,
      concurrency: 2,
    });
    return analysis;
  }

  const updatedTargets = await mapWithConcurrency(
    targets,
    2,
    async finding =>
      runSemanticLlmEvaluationForCustomFinding({
        analysisIssue: analysis.issue,
        finding,
        accountId,
        installationId,
        assistAnalysisWithLlmFn,
      })
  );

  const updatesById = new Map(updatedTargets.map(item => [item.id, item]));
  const allFindings = [
    ...(analysis.findings?.critical ?? []),
    ...(analysis.findings?.warnings ?? []),
    ...(analysis.findings?.info ?? []),
    ...(analysis.findings?.fulfilled ?? []),
  ];
  const mergedFindings = allFindings.map(finding => updatesById.get(finding.id) ?? finding);
  const regroupedFindings = groupFindings(mergedFindings);

  const nextAnalysis = {
    ...analysis,
    findings: regroupedFindings,
    score: calculateScore(regroupedFindings),
    summary: buildSummary(regroupedFindings),
  };

  logInfo('analysis.semantic_evaluation.timing', {
    issueKey: analysis?.issue?.key ?? null,
    targetCount: targets.length,
    durationMs: Date.now() - semanticStartedAtMs,
    concurrency: 2,
  });

  return nextAnalysis;
}

function evaluateRule(ruleId, issue) {
  switch (ruleId) {
    case 'title_present':
      return issue.summary ? createFinding(RULE_DEFINITIONS.title_present) : null;
    case 'description_present':
      return issue.description ? createFinding(RULE_DEFINITIONS.description_present) : null;
    case 'acceptance_criteria_missing':
      // Akzeptanzkriterien liegen in Azure Boards in einem eigenen Feld und sind damit
      // unabhängig von der Beschreibung auswertbar – anders als beim alten Jira-Workaround,
      // bei dem AC-Text in der Beschreibung gesucht wurde und ohne Beschreibung nicht
      // prüfbar war.
      return hasAcceptanceCriteria(issue)
        ? createFinding(RULE_DEFINITIONS.acceptance_criteria_present)
        : createFinding(RULE_DEFINITIONS.acceptance_criteria_missing);
    case 'priority_missing':
      return hasPriority(issue)
        ? createFinding(RULE_DEFINITIONS.priority_present)
        : createFinding(RULE_DEFINITIONS.priority_missing);
    case 'user_value_unclear':
      {
        const semanticEvaluation = evaluateUserValueSemantics(issue);
        if (semanticEvaluation.status === SEMANTIC_EVALUATION_STATUSES.PASS) {
          return createFinding(RULE_DEFINITIONS.user_value_present, { semanticEvaluation });
        }

        if (semanticEvaluation.status === SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE) {
          return createFinding(RULE_DEFINITIONS.user_value_unclear, {
            severity: 'info',
            title: 'User Value nicht zuverlaessig pruefbar',
            description: 'Die vorhandenen Ticketinformationen reichen fuer eine verlaessliche Bewertung des User Value nicht aus.',
            impact: 'Der Check konnte nicht sicher bewertet werden.',
            fixable: false,
            semanticEvaluation,
          });
        }

        return createFinding(RULE_DEFINITIONS.user_value_unclear, { semanticEvaluation });
      }
    case 'examples_missing':
      {
        const semanticEvaluation = evaluateExamplesSemantics(issue);
        if (semanticEvaluation.status === SEMANTIC_EVALUATION_STATUSES.PASS) {
          return createFinding(RULE_DEFINITIONS.examples_present, { semanticEvaluation });
        }

        if (semanticEvaluation.status === SEMANTIC_EVALUATION_STATUSES.NOT_TESTABLE) {
          return createFinding(RULE_DEFINITIONS.examples_missing, {
            severity: 'info',
            title: 'Beispiele nicht zuverlaessig pruefbar',
            description: 'Die vorhandenen Ticketinformationen reichen fuer eine verlaessliche Bewertung konkreter Beispiele nicht aus.',
            impact: 'Der Check konnte nicht sicher bewertet werden.',
            fixable: false,
            semanticEvaluation,
          });
        }

        return createFinding(RULE_DEFINITIONS.examples_missing, { semanticEvaluation });
      }
    case 'estimation_missing':
      return hasEstimate(issue)
        ? createFinding(RULE_DEFINITIONS.estimation_present)
        : createFinding(RULE_DEFINITIONS.estimation_missing);
    default:
      return null;
  }
}

function getRuleIdsForRulesets(activeRulesetIds) {
  return [...new Set(
    activeRulesetIds.flatMap(rulesetId => RULESET_RULE_IDS[rulesetId] ?? [])
  )];
}

function groupFindings(findings) {
  return findings.reduce(
    (groups, finding) => {
      if (finding.severity === 'critical') {
        groups.critical.push(finding);
      } else if (finding.severity === 'warning') {
        groups.warnings.push(finding);
      } else if (finding.severity === 'info') {
        groups.info.push(finding);
      } else {
        groups.fulfilled.push(finding);
      }

      return groups;
    },
    {
      critical: [],
      warnings: [],
      info: [],
      fulfilled: [],
    }
  );
}

function calculateScore(groupedFindings) {
  const penalty = (groupedFindings.critical.length * 18) + (groupedFindings.warnings.length * 10);
  return Math.max(0, 100 - penalty);
}

function buildSummary(groupedFindings) {
  return {
    critical: groupedFindings.critical.length,
    hints: groupedFindings.warnings.length,
    neutral: groupedFindings.info.length,
    fulfilled: groupedFindings.fulfilled.length,
  };
}

export function normalizeActiveRulesets(activeRulesetIds) {
  if (Array.isArray(activeRulesetIds) && activeRulesetIds.length > 0) {
    return activeRulesetIds;
  }

  return [...DEFAULT_ACTIVE_RULESET_IDS];
}

export function runRulesetAnalysis(issue, activeRulesetIds, customRulesets = []) {
  const normalizedRulesets = normalizeActiveRulesets(activeRulesetIds);
  const evaluatedDefaultRuleIds = getRuleIdsForRulesets(normalizedRulesets);
  const defaultFindings = evaluatedDefaultRuleIds
    .map(ruleId => evaluateRule(ruleId, issue))
    .filter(Boolean);
  const customRuleFindings = getActiveCustomRules(normalizedRulesets, customRulesets)
    .map(entry => createCustomRuleFinding({ ...entry, issue }));
  const findings = [...defaultFindings, ...customRuleFindings];
  const groupedFindings = groupFindings(findings);
  const evaluatedRuleIds = [
    ...evaluatedDefaultRuleIds,
    ...customRuleFindings.map(finding => finding.id),
  ];

  return {
    issue,
    activeRulesetIds: normalizedRulesets,
    score: calculateScore(groupedFindings),
    summary: buildSummary(groupedFindings),
    findings: groupedFindings,
    metadata: {
      evaluatedRuleIds,
      engine: 'deterministic-rules-v1',
      cacheKeyFingerprint: buildCacheKeyFingerprint(issue, normalizedRulesets),
      analysisInputFingerprint: buildAnalysisInputFingerprint(issue, normalizedRulesets, customRulesets),
    },
  };
}

export async function analyzeIssue({
  issueKey,
  contextIssueKey,
  activeRulesetIds,
  accountId = null,
  installationId = null,
  normalizedIssue = null,
  onProgress = async () => {},
}) {
  const analysisStartedAtMs = Date.now();
  await onProgress('loading_ticket', 'Ticket wird geladen');
  const issueFetchStartedAtMs = Date.now();
  const resolvedIssue =
    normalizedIssue ?? (await getNormalizedIssue({ issueKey, contextIssueKey }));
  const issueFetchDurationMs = Date.now() - issueFetchStartedAtMs;

  await onProgress('preparing_rules', 'Regelwerk wird vorbereitet');
  const rulesetLoadStartedAtMs = Date.now();
  const storedRulesetsState = await getRulesetsState();
  const rulesetLoadDurationMs = Date.now() - rulesetLoadStartedAtMs;
  const resolvedActiveRulesets = normalizeActiveRulesets(
    activeRulesetIds ?? storedRulesetsState.activeRulesetIds
  );

  const deterministicStartedAtMs = Date.now();
  const baseAnalysis = runRulesetAnalysis(
    resolvedIssue,
    resolvedActiveRulesets,
    storedRulesetsState.customRulesets
  );
  const deterministicDurationMs = Date.now() - deterministicStartedAtMs;

  await onProgress('checking_requirements', 'Anforderungen werden geprüft');
  const semanticStartedAtMs = Date.now();
  const finalAnalysis = await applySemanticLlmEvaluationsToAnalysis(baseAnalysis, {
    accountId,
    installationId,
  });
  const semanticEvaluationDurationMs = Date.now() - semanticStartedAtMs;

  logInfo('analysis.timing', {
    issueKey: finalAnalysis?.issue?.key ?? null,
    totalDurationMs: Date.now() - analysisStartedAtMs,
    issueFetchDurationMs,
    rulesetLoadDurationMs,
    deterministicEvaluationDurationMs: deterministicDurationMs,
    semanticEvaluationDurationMs,
    activeRulesetCount: resolvedActiveRulesets.length,
    customRulesetCount: storedRulesetsState.customRulesets.length,
  });

  return finalAnalysis;
}

export const __testUtils = {
  applySemanticLlmEvaluationsToAnalysis,
  mapLlmRecommendationToSemanticStatus,
};
