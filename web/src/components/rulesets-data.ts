import { invoke } from '../api/invoke';

export type Ruleset = {
  id: string;
  name: string;
  description: string;
  checksCount: number;
  recommended: boolean;
  isCustom?: boolean;
  evaluatorSummary?: string;
  customRules?: Array<{
    id: string;
    name: string;
    evaluatorType?: CustomRuleEvaluatorType;
  }>;
};

export type CustomRuleSeverity = 'critical' | 'warning';
export type CustomRuleEvaluatorType = 'deterministic' | 'semantic_llm';
export type CustomRuleScope = 'auto' | 'title' | 'main_description' | 'full_description';
export type TicketType = 'Story' | 'Bug' | 'Task';

export type CustomRule = {
  id: string;
  name: string;
  checkDescription: string;
  severity: CustomRuleSeverity;
  evaluatorType?: CustomRuleEvaluatorType;
  scope?: CustomRuleScope;
  example?: string;
};

export type CustomRuleset = {
  id: string;
  name: string;
  description: string;
  appliesTo: TicketType[];
  rules: CustomRule[];
  createdAt: number;
};

export type UserState = {
  hasUsedPlugin: boolean;
  preferredRulesetIds: string[];
  lastViewedIssueKey: string | null;
};

type RulesetsStatePayload = {
  activeRulesetIds?: string[];
  customRulesets?: CustomRuleset[];
};

export const DEFAULT_RULESETS: Ruleset[] = [
  {
    id: 'basic-quality',
    name: 'Basis-Qualitätsprüfungen',
    description: 'Deterministische Prüfungen für Titel, Beschreibung, Akzeptanzkriterien, Priorität und Aufwandsschätzung',
    checksCount: 5,
    recommended: true,
  },
  {
    id: 'ai-quality',
    name: 'KI-Qualitätsprüfungen',
    description: 'Semantische Qualitätsprüfungen für Nutzerwert und konkrete Beispiele',
    checksCount: 2,
    recommended: false,
  },
  {
    id: 'duplicate-check',
    name: 'Duplikatprüfung',
    description: 'Durchsucht das Projekt nach offenen Tickets mit ähnlichem Titel und markiert mögliche Duplikate',
    checksCount: 1,
    recommended: false,
  },
];

const DEFAULT_ACTIVE_RULESET_IDS = ['basic-quality'];

const EVALUATOR_TYPE_LABELS: Record<CustomRuleEvaluatorType, string> = {
  deterministic: 'Deterministisch',
  semantic_llm: 'Semantisch (LLM)',
};

function buildEvaluatorSummary(ruleset: CustomRuleset) {
  const normalizedTypes = (ruleset.rules ?? [])
    .map(rule => (rule.evaluatorType === 'deterministic' || rule.evaluatorType === 'semantic_llm')
      ? rule.evaluatorType
      : 'semantic_llm');
  const uniqueTypes = [...new Set(normalizedTypes)];

  if (uniqueTypes.length === 0) {
    return null;
  }

  return uniqueTypes
    .map(type => EVALUATOR_TYPE_LABELS[type as CustomRuleEvaluatorType] ?? EVALUATOR_TYPE_LABELS.semantic_llm)
    .join(', ');
}

function mapCustomRulesets(customRulesets: CustomRuleset[]): Ruleset[] {
  return customRulesets.map<Ruleset>(ruleset => ({
    id: ruleset.id,
    name: ruleset.name,
    description: ruleset.description,
    checksCount: ruleset.rules.length,
    recommended: false,
    isCustom: true,
    evaluatorSummary: buildEvaluatorSummary(ruleset) ?? undefined,
    customRules: ruleset.rules.map(rule => ({
      id: rule.id,
      name: rule.name,
      evaluatorType: (rule.evaluatorType === 'deterministic' || rule.evaluatorType === 'semantic_llm')
        ? rule.evaluatorType
        : 'semantic_llm',
    })),
  }));
}

export function getEvaluatorTypeLabel(type?: CustomRuleEvaluatorType) {
  return EVALUATOR_TYPE_LABELS[type ?? 'semantic_llm'] ?? EVALUATOR_TYPE_LABELS.semantic_llm;
}

function normalizeRulesetsState(payload: RulesetsStatePayload | undefined) {
  const activeRulesetIds = Array.isArray(payload?.activeRulesetIds) && payload.activeRulesetIds.length > 0
    ? payload.activeRulesetIds
    : DEFAULT_ACTIVE_RULESET_IDS;
  const customRulesets = Array.isArray(payload?.customRulesets) ? payload.customRulesets : [];

  return {
    activeRulesetIds,
    customRulesets,
    allRulesets: [...DEFAULT_RULESETS, ...mapCustomRulesets(customRulesets)],
  };
}

export async function getRulesetsState() {
  const payload = await invoke<RulesetsStatePayload>('getRulesetsState');
  return normalizeRulesetsState(payload);
}

export async function loadActiveRulesets() {
  const payload = await getRulesetsState();
  return payload.activeRulesetIds;
}

export async function saveActiveRulesets(ids: string[]) {
  const payload = await invoke<RulesetsStatePayload>('saveActiveRulesets', {
    activeRulesetIds: ids,
  });

  return normalizeRulesetsState(payload);
}

export async function loadCustomRulesets() {
  const payload = await getRulesetsState();
  return payload.customRulesets;
}

export async function saveCustomRuleset(ruleset: CustomRuleset) {
  const payload = await invoke<RulesetsStatePayload>('createCustomRuleset', {
    ruleset,
  });

  return normalizeRulesetsState(payload);
}

export async function updateCustomRuleset(ruleset: CustomRuleset) {
  const payload = await invoke<RulesetsStatePayload>('updateCustomRuleset', {
    ruleset,
  });

  return normalizeRulesetsState(payload);
}

export async function deleteCustomRuleset(id: string) {
  const payload = await invoke<RulesetsStatePayload>('deleteCustomRuleset', {
    rulesetId: id,
  });

  return normalizeRulesetsState(payload);
}

export async function loadUserState(): Promise<UserState> {
  const payload = await invoke<Partial<UserState>>('getUserState');
  return {
    hasUsedPlugin: Boolean(payload?.hasUsedPlugin),
    preferredRulesetIds: Array.isArray(payload?.preferredRulesetIds) && payload.preferredRulesetIds.length > 0
      ? payload.preferredRulesetIds
      : DEFAULT_ACTIVE_RULESET_IDS,
    lastViewedIssueKey: typeof payload?.lastViewedIssueKey === 'string'
      ? payload.lastViewedIssueKey
      : null,
  };
}

export async function saveUserState(patch: Partial<UserState>) {
  const payload = await invoke<Partial<UserState>>('updateUserState', patch);
  return {
    hasUsedPlugin: Boolean(payload?.hasUsedPlugin),
    preferredRulesetIds: Array.isArray(payload?.preferredRulesetIds) && payload.preferredRulesetIds.length > 0
      ? payload.preferredRulesetIds
      : DEFAULT_ACTIVE_RULESET_IDS,
    lastViewedIssueKey: typeof payload?.lastViewedIssueKey === 'string'
      ? payload.lastViewedIssueKey
      : null,
  };
}
