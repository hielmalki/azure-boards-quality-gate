import { getValue, setValue } from './table-kv-store.js';
import { getFixSuggestionRunKey } from './storage-keys.js';

export async function getFixSuggestionRun({ issueKey, findingId, runId }, deps = {}) {
  if (!issueKey || !findingId || !runId) {
    return null;
  }

  return (await getValue(getFixSuggestionRunKey(issueKey, findingId, runId), deps)) ?? null;
}

export async function setFixSuggestionRun({ issueKey, findingId, runId, record }, deps = {}) {
  if (!issueKey || !findingId || !runId) {
    return;
  }

  await setValue(getFixSuggestionRunKey(issueKey, findingId, runId), record, deps);
}
