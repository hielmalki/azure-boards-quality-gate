import { kvs } from '@forge/kvs';
import { getIssueAnalysisKey } from './storage-keys.js';

export async function getStoredIssueAnalysis(issueKey) {
  if (!issueKey) {
    return null;
  }

  return (await kvs.get(getIssueAnalysisKey(issueKey))) ?? null;
}

export async function setStoredIssueAnalysis(issueKey, analysisRecord) {
  if (!issueKey) {
    return;
  }

  await kvs.set(getIssueAnalysisKey(issueKey), analysisRecord);
}
