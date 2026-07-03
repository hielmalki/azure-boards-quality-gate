export const ACTIVE_RULESETS_KEY = 'rulesets:active';
export const CUSTOM_RULESETS_KEY = 'rulesets:custom';
export const APP_CONFIG_OPENAI_KEY = 'app-config:openai-api-key';

export function getUserStateKey(accountId) {
  return `user-state:${accountId ?? 'anonymous'}`;
}

export function getIssueAnalysisKey(issueKey) {
  return `analysis:${issueKey}`;
}

export function getApplyAuditKey(issueKey, auditId) {
  return `apply-audit:${issueKey}:${auditId}`;
}

export function getAiUsageKey(accountId) {
  return `ai-usage:${accountId ?? 'anonymous'}`;
}

export function getFixSuggestionRunKey(issueKey, findingId, runId) {
  return `fix-suggestion-run:${issueKey ?? 'unknown'}:${findingId ?? 'unknown'}:${runId ?? 'unknown'}`;
}
