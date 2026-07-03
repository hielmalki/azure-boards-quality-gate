import { getStoredUserState, setStoredUserState } from '../repositories/user-state-repository.js';
import { DEFAULT_ACTIVE_RULESET_IDS } from './ruleset-service.js';

function normalizeUserState(storedUserState) {
  return {
    hasUsedPlugin: Boolean(storedUserState?.hasUsedPlugin),
    preferredRulesetIds: Array.isArray(storedUserState?.preferredRulesetIds) && storedUserState.preferredRulesetIds.length > 0
      ? [...new Set(storedUserState.preferredRulesetIds.filter(id => typeof id === 'string' && id.trim().length > 0))]
      : [...DEFAULT_ACTIVE_RULESET_IDS],
    lastViewedIssueKey: typeof storedUserState?.lastViewedIssueKey === 'string'
      ? storedUserState.lastViewedIssueKey
      : null,
  };
}

export async function getUserState(accountId) {
  const storedUserState = await getStoredUserState(accountId);
  return normalizeUserState(storedUserState);
}

export async function updateUserState(accountId, patch) {
  const currentUserState = await getUserState(accountId);
  const nextUserState = normalizeUserState({
    ...currentUserState,
    ...patch,
  });

  await setStoredUserState(accountId, nextUserState);
  return nextUserState;
}
