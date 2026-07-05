/**
 * Kern-Domänenmodell und reine Hilfsfunktionen für den Anforderungsprüfungs-Screen.
 *
 * Dieses Modul enthält bewusst:
 * - Typdefinitionen, die von TriagePanel und Sub-Flows verwendet werden
 * - deterministische Mapping-Logik (Backend-Analyse → UI-Issue-Modell)
 * - kleine Formatierungs-/Label-Hilfsfunktionen
 *
 * Dieses Modul enthält bewusst NICHT:
 * - React State
 * - Nebeneffekte
 * - API-Aufrufe
 */

export type SeverityLevel = 'critical' | 'warning' | 'info' | 'success';

export type Issue = {
  id: string;
  title: string;
  description: string;
  severity: SeverityLevel;
  impact: string;
  semanticEvaluationStatus?: 'pass' | 'fail' | 'not_testable';
  semanticEvaluationScope?: 'title' | 'main_description' | 'full_description';
  evaluatorType?: 'deterministic' | 'semantic_llm';
  semanticEvidence: string[];
  effort: 'quick' | 'medium' | 'long';
  hasAIFix: boolean;
  aiSuggestion?: string;
  beforeText?: string;
  afterText?: string;
  category: string;
  scoreImpact?: number;
};

export type IssueTriage = {
  critical: Issue[];
  warnings: Issue[];
  info: Issue[];
  healthy: Issue[];
};

export type AnalysisFinding = {
  id: string;
  title: string;
  evaluatorType?: 'deterministic' | 'semantic_llm';
  severity: 'critical' | 'warning' | 'info' | 'fulfilled';
  description: string;
  impact: string;
  semanticEvaluation?: {
    status?: 'pass' | 'fail' | 'not_testable';
    scope?: 'title' | 'main_description' | 'full_description';
    evidence?: Array<{ type?: string; detail?: string }>;
  };
  fixable?: boolean;
  rulesetId?: string;
};

export type AnalysisResult = {
  issue?: {
    key?: string | null;
    summary?: string | null;
    description?: string | null;
    issueType?: {
      id?: string | null;
      name?: string | null;
    };
    priority?: {
      id?: string | null;
      name?: string | null;
    };
    labels?: string[];
    status?: {
      id?: string | null;
      name?: string | null;
      category?: string | null;
    };
  };
  score?: number;
  summary?: {
    critical: number;
    hints: number;
    fulfilled: number;
  };
  findings?: {
    critical?: AnalysisFinding[];
    warnings?: AnalysisFinding[];
    info?: AnalysisFinding[];
    fulfilled?: AnalysisFinding[];
  };
  activeRulesetIds?: string[];
};

export type NormalizedIssueResponse = AnalysisResult['issue'];

export type FixSuggestionPayload = {
  issueKey: string | null;
  findingId: string | null;
  findingTitle: string | null;
  targetField: string | null;
  status: 'completed' | 'failed';
  currentText: string;
  suggestedText: string;
  summary: string | null;
  reasoning: string | null;
  provider: string | null;
  model: string | null;
  error: { code: string; message: string } | null;
};

export type FixSuggestionStreamStartResponse = {
  issueKey?: string;
  findingId?: string;
  runId?: string;
  status?: string;
  error?: { message?: string } | null;
};

export type FixSuggestionStreamResultResponse = {
  issueKey?: string;
  status?: string;
  hasFirstChunk?: boolean;
  partialText?: string;
  suggestion?: {
    currentText?: string;
    suggestedText?: string;
    summary?: string;
    targetField?: string;
    reasoning?: string;
  } | null;
  error?: { message?: string } | null;
};

export type BackendAnalysisProgress = {
  stepKey?: 'loading_ticket' | 'preparing_rules' | 'checking_requirements' | 'preparing_results';
  stepIndex?: number;
  totalSteps?: number;
  progressPercent?: number;
  message?: string;
  details?: string | null;
  updatedAt?: string;
};

export type TestCaseStep = {
  action: string;
  expected: string;
};

export type TestCase = {
  title: string;
  preconditions: string;
  steps: TestCaseStep[];
  priority: number;
  derivedFrom: string | null;
  /** Vom Backend geliefert, sofern die KI-Antwort einen erkennbaren Typ enthielt. */
  type?: TestCaseTypeKey | null;
};

export type GenerateTestCasesResponse = {
  issueKey: string;
  testCases: TestCase[];
  existingCount?: number;
};

export type ExistingTestCase = {
  id: string;
  title: string;
  state: string;
  steps: TestCaseStep[];
};

// Vom Nutzer im geführten Formular gewählte Steuerung der Generierung.
export type TestCaseTypeKey = 'happyPath' | 'negative' | 'edge';

export type TestCaseTypeConfig = {
  enabled: boolean;
  count: number;
};

export type TestCaseGenerationConfig = {
  types: Record<TestCaseTypeKey, TestCaseTypeConfig>;
  stepsPerCase: number;
};

export const TEST_CASE_TYPE_ORDER: TestCaseTypeKey[] = ['happyPath', 'negative', 'edge'];

export const TEST_CASE_TYPE_LABELS: Record<TestCaseTypeKey, string> = {
  happyPath: 'Happy Path',
  negative: 'Negativfälle',
  edge: 'Randfälle',
};

// Badge für einen einzelnen generierten Testfall (Singular, anders als die
// Typ-Auswahl im Konfig-Formular oben, die die Anzahl je Typ steuert).
export type TestCaseTypeBadge = {
  label: string;
  badgeClass: string;
  dotClass: string;
};

export const TEST_CASE_TYPE_BADGE: Record<TestCaseTypeKey, TestCaseTypeBadge> = {
  happyPath: {
    label: 'Positivfall',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  },
  negative: {
    label: 'Negativfall',
    badgeClass: 'bg-red-50 text-red-600 border-red-200',
    dotClass: 'bg-red-400',
  },
  edge: {
    label: 'Randfall',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
    dotClass: 'bg-blue-500',
  },
};

export const DEFAULT_TEST_CASE_CONFIG: TestCaseGenerationConfig = {
  types: {
    happyPath: { enabled: true, count: 2 },
    negative: { enabled: true, count: 2 },
    edge: { enabled: false, count: 1 },
  },
  stepsPerCase: 4,
};

export function countConfiguredTestCases(config: TestCaseGenerationConfig): number {
  return TEST_CASE_TYPE_ORDER.reduce((total, key) => {
    const type = config.types[key];
    return type.enabled ? total + Math.max(0, type.count) : total;
  }, 0);
}

export type ListTestCasesResponse = {
  issueKey: string;
  existingTestCases: ExistingTestCase[];
  count: number;
};

// Weg B (Steps ergänzen): zusätzliche Schritte für einen bestehenden Test Case
// generieren (Vorschau) und anschließend zusammengeführt zurückschreiben.
export type GenerateTestStepsResponse = {
  issueKey: string;
  testCaseId: string;
  newSteps: TestCaseStep[];
};

export type ApplyTestStepsResponse = {
  testCaseId: string;
  stepCount: number;
  status: 'completed';
};

export type CreateTestCaseWorkItemsResponse = {
  issueKey: string;
  results: Array<{
    status: 'completed' | 'failed';
    title: string;
    testCaseId: string | null;
    error: { code: string; message: string } | null;
  }>;
  summary: { requested: number; succeeded: number; failed: number };
};

export type AttachTestCasesResponse = {
  issueKey: string;
  status: 'completed';
  attachedCount: number;
};

export const BASE_SCORE = 42;

const FIXED_CURRENT_STATE_TEXT: Partial<Record<string, string>> = {
  acceptance_criteria_missing: 'Keine Akzeptanzkriterien definiert',
  title_missing: 'Kein Titel vorhanden',
  description_missing: 'Keine Beschreibung vorhanden',
};

/**
 * Ermittelt das Jira-Feld, das ein Finding aktualisieren kann.
 *
 * @param issueId Stabiler Finding-Identifier.
 * @returns Jira-Feld-Kennung, die vom Vorschlags-/Apply-Flow verwendet wird.
 */
export function getSuggestionTargetField(issueId: string): 'summary' | 'description' | 'acceptanceCriteria' {
  if (issueId === 'title_missing' || issueId === 'title_present') {
    return 'summary';
  }

  if (issueId === 'acceptance_criteria_missing' || issueId === 'acceptance_criteria_present') {
    return 'acceptanceCriteria';
  }

  return 'description';
}

/**
 * Gibt deterministischen Ist-Zustand-Text für „fehlendes Feld"-Findings zurück.
 * Verhindert verwirrende leere Vorher-Texte im Fix-Flow.
 */
export function getFixedCurrentStateText(issueId: string) {
  return FIXED_CURRENT_STATE_TEXT[issueId] ?? null;
}

/**
 * Schreibt standardisierte Anforderungsprüfungs-Logs.
 * Das Panel nutzt dies, um Frontend-Timing- und Schritt-Logs konsistent zu halten.
 */
export function logAnalysisStep(step: number, message: string, details?: unknown) {
  if (details !== undefined) {
    console.log(`[Requirement Check] ${step}. ${message}`, details);
    return;
  }

  console.log(`[Requirement Check] ${step}. ${message}`);
}

export function areRulesetIdsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

/**
 * Mappt ein einzelnes Backend-Finding auf das UI-freundliche Issue-Modell.
 *
 * @param finding Einzelnes Backend-Finding.
 * @param normalizedIssue Optionaler normalisierter Issue-Kontext vom Backend.
 */
export function mapFindingToIssue(finding: AnalysisFinding, normalizedIssue?: AnalysisResult['issue']): Issue {
  const targetField = getSuggestionTargetField(finding.id);
  const fixedCurrentStateText = getFixedCurrentStateText(finding.id);
  const currentText = fixedCurrentStateText ?? (
    targetField === 'summary'
      ? normalizedIssue?.summary ?? ''
      : normalizedIssue?.description ?? ''
  );

  const semanticEvidence = (finding.semanticEvaluation?.evidence ?? [])
    .map(entry => entry?.detail?.trim())
    .filter((detail): detail is string => Boolean(detail));

  return {
    id: finding.id,
    title: finding.title,
    description: finding.description,
    severity:
      finding.severity === 'critical'
        ? 'critical'
        : finding.severity === 'warning'
          ? 'warning'
          : finding.severity === 'info'
            ? 'info'
          : 'success',
    impact: finding.impact,
    evaluatorType: finding.evaluatorType,
    semanticEvaluationStatus: finding.semanticEvaluation?.status,
    semanticEvaluationScope: finding.semanticEvaluation?.scope,
    semanticEvidence,
    effort: finding.fixable ? 'quick' : 'medium',
    hasAIFix: Boolean(finding.fixable),
    category: finding.rulesetId ?? 'Analysis',
    scoreImpact: finding.severity === 'critical' ? 12 : finding.severity === 'warning' ? 6 : 0,
    beforeText: currentText,
  };
}

/**
 * Wandelt Backend-Semantik-Status/-Evaluator-Metadaten in eine nutzerorientierte Statuszeile um.
 */
export function getSemanticStatusLabel(
  status?: 'pass' | 'fail' | 'not_testable',
  evaluatorType?: 'deterministic' | 'semantic_llm'
) {
  if (status === 'not_testable') {
    return 'Nicht zuverlässig prüfbar';
  }

  if (status === 'fail') {
    return evaluatorType === 'deterministic'
      ? 'Deterministisch nicht erfüllt'
      : 'Semantisch nicht erfüllt';
  }

  if (status === 'pass') {
    return evaluatorType === 'deterministic'
      ? 'Deterministisch erfüllt'
      : 'Semantisch erfüllt';
  }

  return null;
}

/**
 * Mappt semantische Bereichsschlüssel auf nutzerorientierte Labels.
 */
export function getSemanticScopeLabel(scope?: 'title' | 'main_description' | 'full_description') {
  if (scope === 'title') {
    return 'Bereich: Titel';
  }

  if (scope === 'main_description') {
    return 'Bereich: Hauptbeschreibung';
  }

  if (scope === 'full_description') {
    return 'Bereich: Vollständige Beschreibung';
  }

  return null;
}

/**
 * Mappt eine vollständige Analyse-Payload auf Triage-Buckets, die von den Panel-Sektionen verwendet werden.
 *
 * Gibt null zurück, wenn keine Analyse vorhanden ist, damit der Aufrufer eine Fallback-Behandlung anwenden kann.
 */
export function mapAnalysisToIssueTriage(analysis: AnalysisResult | null): IssueTriage | null {
  if (!analysis) {
    return null;
  }

  return {
    critical: (analysis.findings?.critical ?? []).map(finding => mapFindingToIssue(finding, analysis.issue)),
    warnings: (analysis.findings?.warnings ?? []).map(finding => mapFindingToIssue(finding, analysis.issue)),
    info: (analysis.findings?.info ?? []).map(finding => mapFindingToIssue(finding, analysis.issue)),
    healthy: (analysis.findings?.fulfilled ?? []).map(finding => mapFindingToIssue(finding, analysis.issue)),
  };
}
