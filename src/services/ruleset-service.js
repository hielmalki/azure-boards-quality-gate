import {
  getStoredActiveRulesets,
  getStoredCustomRulesets,
  setStoredActiveRulesets,
  setStoredCustomRulesets,
} from '../repositories/ruleset-repository.js';
import { getStoredUserState, setStoredUserState } from '../repositories/user-state-repository.js';
import { RULE_EVALUATOR_TYPES } from '../domain/analysis/rule-definitions.js';

export const DEFAULT_ACTIVE_RULESET_IDS = ['basic-quality'];
const DEFAULT_CUSTOM_RULE_EVALUATOR_TYPE = RULE_EVALUATOR_TYPES.SEMANTIC_LLM;
const ALLOWED_CUSTOM_RULE_EVALUATOR_TYPES = new Set(Object.values(RULE_EVALUATOR_TYPES));
const DEFAULT_CUSTOM_RULE_SCOPE = 'auto';
const ALLOWED_CUSTOM_RULE_SCOPES = new Set(['auto', 'title', 'main_description', 'full_description']);

function normalizeCustomRuleEvaluatorType(rawEvaluatorType) {
  if (rawEvaluatorType === 'semantic_heuristic' || rawEvaluatorType === 'hybrid') {
    return RULE_EVALUATOR_TYPES.SEMANTIC_LLM;
  }

  if (ALLOWED_CUSTOM_RULE_EVALUATOR_TYPES.has(rawEvaluatorType)) {
    return rawEvaluatorType;
  }

  return DEFAULT_CUSTOM_RULE_EVALUATOR_TYPE;
}

function sanitizeRulesetIds(ids) {
  if (!Array.isArray(ids)) {
    return [...DEFAULT_ACTIVE_RULESET_IDS];
  }

  const cleaned = [...new Set(ids.filter(id => typeof id === 'string' && id.trim().length > 0))];
  return cleaned.length > 0 ? [cleaned[0]] : [...DEFAULT_ACTIVE_RULESET_IDS];
}

/**
 * @typedef {'deterministic' | 'semantic_llm'} CustomRuleEvaluatorType
 */

/**
 * A single rule inside a custom ruleset, after sanitization.
 * @typedef {Object} CustomRule
 * @property {string} id
 * @property {string} name
 * @property {string} checkDescription   - What the rule checks (user-defined).
 * @property {'critical' | 'warning'} severity
 * @property {string} example            - Optional example of a passing ticket.
 * @property {CustomRuleEvaluatorType} evaluatorType
 * @property {string} scope              - Which part of the issue to evaluate ('main_description' | etc.).
 */

/**
 * A custom ruleset as stored and used at runtime (after sanitization).
 * @typedef {Object} CustomRuleset
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {Array<'Story' | 'Bug' | 'Task'>} appliesTo
 * @property {CustomRule[]} rules
 * @property {number} createdAt          - Unix timestamp (ms).
 */

function sanitizeCustomRule(rule) {
  const rawEvaluatorType = typeof rule.evaluatorType === 'string' ? rule.evaluatorType : '';
  const evaluatorType = normalizeCustomRuleEvaluatorType(rawEvaluatorType);
  const scope =
    typeof rule.scope === 'string' && ALLOWED_CUSTOM_RULE_SCOPES.has(rule.scope)
      ? rule.scope
      : DEFAULT_CUSTOM_RULE_SCOPE;

  return {
    id: String(rule.id),
    name: String(rule.name),
    checkDescription: String(rule.checkDescription),
    severity: rule.severity === 'critical' ? 'critical' : 'warning',
    example: typeof rule.example === 'string' ? rule.example : '',
    evaluatorType,
    scope,
  };
}

function sanitizeCustomRuleset(ruleset) {
  const rules = Array.isArray(ruleset.rules) ? ruleset.rules.map(sanitizeCustomRule) : [];
  const appliesTo = Array.isArray(ruleset.appliesTo)
    ? ruleset.appliesTo.filter(type => ['Story', 'Bug', 'Task'].includes(type))
    : [];

  return {
    id: String(ruleset.id),
    name: String(ruleset.name),
    description: typeof ruleset.description === 'string' ? ruleset.description : '',
    appliesTo,
    rules,
    createdAt: Number.isFinite(ruleset.createdAt) ? ruleset.createdAt : Date.now(),
  };
}

function validateCustomRuleset(ruleset) {
  if (!ruleset || typeof ruleset !== 'object') {
    throw new Error('Custom ruleset payload is invalid.');
  }

  if (typeof ruleset.id !== 'string' || ruleset.id.trim().length === 0) {
    throw new Error('Custom ruleset id is required.');
  }

  if (typeof ruleset.name !== 'string' || ruleset.name.trim().length === 0) {
    throw new Error('Custom ruleset name is required.');
  }

  if (!Array.isArray(ruleset.rules) || ruleset.rules.length === 0) {
    throw new Error('Custom ruleset must contain at least one rule.');
  }

  for (const rule of ruleset.rules) {
    if (!rule || typeof rule !== 'object') {
      throw new Error('Custom ruleset contains an invalid rule.');
    }

    if (
      typeof rule.evaluatorType === 'string' &&
      !ALLOWED_CUSTOM_RULE_EVALUATOR_TYPES.has(rule.evaluatorType)
    ) {
      throw new Error('Custom rule evaluator type is invalid.');
    }

    if (
      typeof rule.scope === 'string' &&
      !ALLOWED_CUSTOM_RULE_SCOPES.has(rule.scope)
    ) {
      throw new Error('Custom rule scope is invalid.');
    }
  }
}

async function persistPreferredRulesets(accountId, activeRulesetIds) {
  if (!accountId) {
    return;
  }

  const storedUserState = await getStoredUserState(accountId);
  const nextUserState = {
    hasUsedPlugin: Boolean(storedUserState?.hasUsedPlugin),
    preferredRulesetIds: activeRulesetIds,
    lastViewedIssueKey: storedUserState?.lastViewedIssueKey ?? null,
  };

  await setStoredUserState(accountId, nextUserState);
}

export async function getRulesetsState() {
  const [storedActiveRulesets, storedCustomRulesets] = await Promise.all([
    getStoredActiveRulesets(),
    getStoredCustomRulesets(),
  ]);
  const normalizedCustomRulesets = Array.isArray(storedCustomRulesets)
    ? storedCustomRulesets.map(sanitizeCustomRuleset)
    : [];

  return {
    activeRulesetIds: sanitizeRulesetIds(storedActiveRulesets),
    customRulesets: normalizedCustomRulesets,
  };
}

export async function saveActiveRulesets(activeRulesetIds, accountId) {
  const nextActiveRulesets = sanitizeRulesetIds(activeRulesetIds);

  await setStoredActiveRulesets(nextActiveRulesets);
  await persistPreferredRulesets(accountId, nextActiveRulesets);

  return {
    activeRulesetIds: nextActiveRulesets,
  };
}

export async function createCustomRuleset(ruleset) {
  validateCustomRuleset(ruleset);

  const sanitizedRuleset = sanitizeCustomRuleset(ruleset);
  const storedCustomRulesets = await getStoredCustomRulesets();
  const currentCustomRulesets = Array.isArray(storedCustomRulesets)
    ? storedCustomRulesets.map(sanitizeCustomRuleset)
    : [];

  if (currentCustomRulesets.some(entry => entry.id === sanitizedRuleset.id)) {
    throw new Error('A custom ruleset with this id already exists.');
  }

  const nextCustomRulesets = [...currentCustomRulesets, sanitizedRuleset];
  await setStoredCustomRulesets(nextCustomRulesets);

  return {
    customRulesets: nextCustomRulesets,
  };
}

function applyCustomRulesetUpdate(currentRulesets, ruleset) {
  validateCustomRuleset(ruleset);
  const sanitizedRuleset = sanitizeCustomRuleset(ruleset);

  const index = currentRulesets.findIndex(entry => entry.id === sanitizedRuleset.id);
  if (index === -1) {
    throw new Error('Custom ruleset with this id does not exist.');
  }

  const mergedRuleset = {
    ...sanitizedRuleset,
    createdAt: currentRulesets[index].createdAt,
  };

  return currentRulesets.map((entry, i) => (i === index ? mergedRuleset : entry));
}

export async function updateCustomRuleset(ruleset) {
  const { activeRulesetIds, customRulesets } = await getRulesetsState();
  const nextCustomRulesets = applyCustomRulesetUpdate(customRulesets, ruleset);
  await setStoredCustomRulesets(nextCustomRulesets);

  return {
    activeRulesetIds,
    customRulesets: nextCustomRulesets,
  };
}

export const __testUtils = {
  DEFAULT_CUSTOM_RULE_EVALUATOR_TYPE,
  DEFAULT_CUSTOM_RULE_SCOPE,
  applyCustomRulesetUpdate,
  sanitizeCustomRule,
  sanitizeCustomRuleset,
  validateCustomRuleset,
};

export async function deleteCustomRuleset(rulesetId, accountId) {
  if (typeof rulesetId !== 'string' || rulesetId.trim().length === 0) {
    throw new Error('Ruleset id is required.');
  }

  const [{ activeRulesetIds, customRulesets }] = await Promise.all([
    getRulesetsState(),
  ]);

  const nextCustomRulesets = customRulesets.filter(ruleset => ruleset.id !== rulesetId);
  const nextActiveRulesets = sanitizeRulesetIds(activeRulesetIds.filter(id => id !== rulesetId));

  await Promise.all([
    setStoredCustomRulesets(nextCustomRulesets),
    setStoredActiveRulesets(nextActiveRulesets),
    persistPreferredRulesets(accountId, nextActiveRulesets),
  ]);

  return {
    activeRulesetIds: nextActiveRulesets,
    customRulesets: nextCustomRulesets,
  };
}
