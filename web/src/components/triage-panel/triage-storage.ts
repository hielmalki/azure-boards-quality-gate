/**
 * Persistence helpers for Requirement Check UI-only state.
 *
 * The backend analysis remains the source of truth.
 * This module only stores temporary UI markers for "already fixed" findings.
 */

const FULFILLED_FINDING_BY_FIX_ID: Record<string, string> = {
  acceptance_criteria_missing: 'acceptance_criteria_present',
  description_missing: 'description_present',
  estimation_missing: 'estimation_present',
  examples_missing: 'examples_present',
  priority_missing: 'priority_present',
  title_missing: 'title_present',
  user_value_unclear: 'user_value_present',
};

/**
 * Returns the fulfilled finding id that corresponds to a fix finding id.
 *
 * Example: `examples_missing` -> `examples_present`.
 * If no explicit mapping exists, the original id is returned.
 */
export function getResolvedFulfilledFindingId(findingId: string) {
  return FULFILLED_FINDING_BY_FIX_ID[findingId] ?? findingId;
}

/**
 * Builds the sessionStorage key for one Jira issue.
 */
export function getResolvedFindingsStorageKey(issueKey?: string | null) {
  return issueKey ? `qualitygate.resolved-findings.${issueKey}` : null;
}

/**
 * Loads resolved finding ids from browser session storage.
 *
 * Safe on SSR/non-browser environments: returns empty set.
 */
export function loadPersistedResolvedFindingIds(issueKey?: string | null) {
  if (typeof window === 'undefined') {
    return new Set<string>();
  }

  const storageKey = getResolvedFindingsStorageKey(issueKey);
  if (!storageKey) {
    return new Set<string>();
  }

  try {
    const rawValue = window.sessionStorage.getItem(storageKey);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return new Set(Array.isArray(parsedValue) ? parsedValue.filter(value => typeof value === 'string') : []);
  } catch (_error) {
    return new Set<string>();
  }
}

/**
 * Persists resolved finding ids in browser session storage.
 *
 * Existing entries are merged with the given ids (set-union semantics).
 */
export function persistResolvedFindingIds(issueKey: string | null | undefined, findingIds: string[]) {
  if (typeof window === 'undefined') {
    return;
  }

  const storageKey = getResolvedFindingsStorageKey(issueKey);
  if (!storageKey) {
    return;
  }

  const nextIds = new Set(loadPersistedResolvedFindingIds(issueKey));
  findingIds.forEach(findingId => {
    if (findingId) {
      nextIds.add(findingId);
    }
  });

  window.sessionStorage.setItem(storageKey, JSON.stringify([...nextIds]));
}

