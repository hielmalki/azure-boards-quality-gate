/**
 * @typedef {'deterministic' | 'semantic_llm'} RuleEvaluatorType
 */

/**
 * Bestanden-/Fehlgeschlagen-/Nicht-testbar-Kriterien, die ein LLM bei der Auswertung einer eingebauten Regel verwendet.
 * @typedef {Object} SemanticEvaluationContract
 * @property {string[]} passCriteria          - Bedingungen, unter denen die Regel als erfüllt gilt.
 * @property {string[]} failCriteria          - Bedingungen, unter denen die Regel als verletzt gilt.
 * @property {string[]} notTestableCriteria   - Bedingungen, unter denen die Regel nicht getestet werden kann.
 * @property {string[]} evidenceSchema        - Belege, die das LLM liefern darf ('matched_marker' usw.).
 */

/**
 * Ein einzelner Regeleintrag aus RULE_DEFINITIONS.
 * @typedef {Object} RuleDefinition
 * @property {string} id
 * @property {string} rulesetId
 * @property {RuleEvaluatorType} evaluatorType
 * @property {string} title
 * @property {'fulfilled' | 'critical' | 'warning'} severity
 * @property {string} description
 * @property {string} impact
 * @property {boolean} fixable
 * @property {SemanticEvaluationContract | null} [semanticEvaluationContract]
 */

// Der Regelkatalog ist bewusst deterministisch und anbieterunabhängig gehalten.
// Spätere LLM-gestützte Regeln können auf denselben stabilen IDs und Ergebnisstrukturen aufbauen.
export const RULE_EVALUATOR_TYPES = {
  DETERMINISTIC: 'deterministic',
  SEMANTIC_LLM: 'semantic_llm',
};

export const SEMANTIC_EVALUATION_STATUSES = {
  PASS: 'pass',
  FAIL: 'fail',
  NOT_TESTABLE: 'not_testable',
};

export const RULE_DEFINITIONS = {
  title_present: {
    id: 'title_present',
    rulesetId: 'basic-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.DETERMINISTIC,
    title: 'Titel vorhanden',
    severity: 'fulfilled',
    description: 'Das Ticket hat einen aussagekräftigen Titel.',
    impact: 'Die Anforderung lässt sich auf Anhieb besser verstehen.',
    fixable: false,
  },
  description_present: {
    id: 'description_present',
    rulesetId: 'basic-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.DETERMINISTIC,
    title: 'Beschreibung vorhanden',
    severity: 'fulfilled',
    description: 'Das Ticket enthält eine Beschreibung.',
    impact: 'Das Team hat genug Kontext, um die Anforderung umzusetzen.',
    fixable: false,
  },
  acceptance_criteria_present: {
    id: 'acceptance_criteria_present',
    rulesetId: 'basic-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.DETERMINISTIC,
    title: 'Akzeptanzkriterien vorhanden',
    severity: 'fulfilled',
    description: 'Das Ticket enthält nutzbare Akzeptanzkriterien.',
    impact: 'Die Story kann sauber getestet und abgenommen werden.',
    fixable: false,
  },
  acceptance_criteria_missing: {
    id: 'acceptance_criteria_missing',
    rulesetId: 'basic-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.DETERMINISTIC,
    title: 'Akzeptanzkriterien fehlen',
    severity: 'critical',
    description: 'Das Ticket enthält keine klaren Akzeptanzkriterien.',
    impact: 'Die Story kann nicht sauber getestet oder abgenommen werden.',
    fixable: true,
  },
  priority_present: {
    id: 'priority_present',
    rulesetId: 'basic-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.DETERMINISTIC,
    title: 'Priorität gesetzt',
    severity: 'fulfilled',
    description: 'Dem Ticket ist eine Priorität zugewiesen.',
    impact: 'Das Ticket lässt sich leichter sortieren und priorisieren.',
    fixable: false,
  },
  priority_missing: {
    id: 'priority_missing',
    rulesetId: 'basic-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.DETERMINISTIC,
    title: 'Priorität fehlt',
    severity: 'warning',
    description: 'Für dieses Ticket wurde keine Priorität gesetzt.',
    impact: 'Priorisierung und Backlog-Triage werden erschwert.',
    fixable: false,
  },
  estimation_present: {
    id: 'estimation_present',
    rulesetId: 'basic-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.DETERMINISTIC,
    title: 'Aufwandsschätzung vorhanden',
    severity: 'fulfilled',
    description: 'Das Ticket hat eine Aufwandsschätzung.',
    impact: 'Sprint-Planung und Kapazitätsplanung sind besser fundiert.',
    fixable: false,
  },
  user_value_present: {
    id: 'user_value_present',
    rulesetId: 'ai-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.SEMANTIC_LLM,
    semanticEvaluationContract: {
      passCriteria: [
        'Die Hauptbeschreibung macht den Wert, Zweck oder Nutzen der Arbeit verständlich.',
        'Das Ticket enthält eine explizite Wertaussage oder einen klar ableitbaren Zwecksatz.',
      ],
      failCriteria: [
        'Die Beschreibung nennt nur Implementierungsdetails, ohne den Grund für die Arbeit zu erklären.',
        'Der Wert oder Zweck der Anforderung ist aus dem aktuellen Tickettext nicht erkennbar.',
      ],
      notTestableCriteria: [
        'Es ist kein aussagekräftiger Beschreibungstext vorhanden, der ausgewertet werden könnte.',
      ],
      evidenceSchema: [
        'matched_marker',
        'matched_sentence',
        'missing_description_body',
      ],
    },
    title: 'Nutzerwert erkennbar',
    severity: 'fulfilled',
    description: 'Das Ticket beschreibt den Geschäftswert oder Nutzen klar.',
    impact: 'Ziel und Wert der Anforderung sind leicht verständlich.',
    fixable: false,
  },
  user_value_unclear: {
    id: 'user_value_unclear',
    rulesetId: 'ai-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.SEMANTIC_LLM,
    semanticEvaluationContract: {
      passCriteria: [
        'Die Hauptbeschreibung macht den Wert, Zweck oder Nutzen der Arbeit verständlich.',
        'Das Ticket enthält eine explizite Wertaussage oder einen klar ableitbaren Zwecksatz.',
      ],
      failCriteria: [
        'Die Beschreibung nennt nur Implementierungsdetails, ohne den Grund für die Arbeit zu erklären.',
        'Der Wert oder Zweck der Anforderung ist aus dem aktuellen Tickettext nicht erkennbar.',
      ],
      notTestableCriteria: [
        'Es ist kein aussagekräftiger Beschreibungstext vorhanden, der ausgewertet werden könnte.',
      ],
      evidenceSchema: [
        'matched_marker',
        'matched_sentence',
        'missing_description_body',
      ],
    },
    title: 'Nutzerwert unklar',
    severity: 'critical',
    description: 'Es ist nicht klar beschrieben, warum diese Anforderung für den Nutzer oder das Produkt wertvoll ist.',
    impact: 'Priorisierung und Umsetzungsziele bleiben unklar.',
    fixable: true,
  },
  examples_present: {
    id: 'examples_present',
    rulesetId: 'ai-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.SEMANTIC_LLM,
    semanticEvaluationContract: {
      passCriteria: [
        'Die Hauptbeschreibung enthält mindestens ein konkretes Beispiel, Szenario oder einen Anwendungsfall.',
        'Das Beispiel hilft, das erwartete Verhalten oder den Nutzungskontext besser zu verstehen.',
      ],
      failCriteria: [
        'Die Beschreibung bleibt abstrakt und veranschaulicht die Anforderung nicht mit einem konkreten Szenario.',
        'Das Ticket enthält kein Beispiel, das das erwartete Verhalten verständlicher macht.',
      ],
      notTestableCriteria: [
        'Es ist kein aussagekräftiger Beschreibungstext vorhanden, der ausgewertet werden könnte.',
      ],
      evidenceSchema: [
        'matched_marker',
        'matched_sentence',
        'missing_description_body',
      ],
    },
    title: 'Konkrete Beispiele vorhanden',
    severity: 'fulfilled',
    description: 'Das Ticket enthält konkrete Beispiele oder Szenarien.',
    impact: 'Erwartetes Verhalten und Nutzungskontext sind klarer.',
    fixable: false,
  },
  examples_missing: {
    id: 'examples_missing',
    rulesetId: 'ai-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.SEMANTIC_LLM,
    semanticEvaluationContract: {
      passCriteria: [
        'Die Hauptbeschreibung enthält mindestens ein konkretes Beispiel, Szenario oder einen Anwendungsfall.',
        'Das Beispiel hilft, das erwartete Verhalten oder den Nutzungskontext besser zu verstehen.',
      ],
      failCriteria: [
        'Die Beschreibung bleibt abstrakt und veranschaulicht die Anforderung nicht mit einem konkreten Szenario.',
        'Das Ticket enthält kein Beispiel, das das erwartete Verhalten verständlicher macht.',
      ],
      notTestableCriteria: [
        'Es ist kein aussagekräftiger Beschreibungstext vorhanden, der ausgewertet werden könnte.',
      ],
      evidenceSchema: [
        'matched_marker',
        'matched_sentence',
        'missing_description_body',
      ],
    },
    title: 'Keine konkreten Beispiele',
    severity: 'critical',
    description: 'Das Ticket enthält keine konkreten Beispiele oder Szenarien, die die Anforderung veranschaulichen.',
    impact: 'Das Risiko von Missverständnissen bei der Umsetzung steigt.',
    fixable: true,
  },
  estimation_missing: {
    id: 'estimation_missing',
    rulesetId: 'basic-quality',
    evaluatorType: RULE_EVALUATOR_TYPES.DETERMINISTIC,
    title: 'Keine Aufwandsschätzung',
    severity: 'warning',
    description: 'Das Ticket hat keine verlässliche Aufwandsschätzung.',
    impact: 'Sprint-Planung und Kapazitätsplanung werden erschwert.',
    fixable: false,
  },
};

export const RULESET_RULE_IDS = {
  'basic-quality': [
    'title_present',
    'description_present',
    'acceptance_criteria_missing',
    'priority_missing',
    'estimation_missing',
  ],
  'ai-quality': ['user_value_unclear', 'examples_missing'],
  invest: [],
  dor: [],
  dod: [],
};
