import { kvs } from '@forge/kvs';
import { getFixSuggestionRunKey } from './storage-keys.js';

export async function getFixSuggestionRun({ issueKey, findingId, runId }) {
  if (!issueKey || !findingId || !runId) {
    return null;
  }

  return (await kvs.get(getFixSuggestionRunKey(issueKey, findingId, runId))) ?? null;
}

export async function setFixSuggestionRun({ issueKey, findingId, runId, record }) {
  if (!issueKey || !findingId || !runId) {
    return;
  }

  await kvs.set(getFixSuggestionRunKey(issueKey, findingId, runId), record);
}
