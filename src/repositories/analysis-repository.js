import { getValue, setValue } from './table-kv-store.js';
import { getIssueAnalysisKey } from './storage-keys.js';

export async function getStoredIssueAnalysis(issueKey, deps = {}) {
  if (!issueKey) {
    return null;
  }

  return (await getValue(getIssueAnalysisKey(issueKey), deps)) ?? null;
}

export async function setStoredIssueAnalysis(issueKey, analysisRecord, deps = {}) {
  if (!issueKey) {
    return;
  }

  await setValue(getIssueAnalysisKey(issueKey), analysisRecord, deps);
}
