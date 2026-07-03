import { kvs } from '@forge/kvs';
import { getApplyAuditKey } from './storage-keys.js';

export async function storeApplyAuditRecord(issueKey, auditId, auditRecord) {
  if (!issueKey || !auditId) {
    return;
  }

  await kvs.set(getApplyAuditKey(issueKey, auditId), auditRecord);
}
