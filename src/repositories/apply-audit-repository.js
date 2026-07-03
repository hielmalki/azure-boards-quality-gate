import { setValue } from './table-kv-store.js';
import { getApplyAuditKey } from './storage-keys.js';

export async function storeApplyAuditRecord(issueKey, auditId, auditRecord, deps = {}) {
  if (!issueKey || !auditId) {
    return;
  }

  await setValue(getApplyAuditKey(issueKey, auditId), auditRecord, deps);
}
