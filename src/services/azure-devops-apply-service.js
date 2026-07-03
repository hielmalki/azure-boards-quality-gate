import { getNormalizedIssue } from './issue-service.js';
import { storeApplyAuditRecord } from '../repositories/apply-audit-repository.js';
import { updateIssueFields } from '../gateways/azure-devops/work-item-gateway.js';
import { createAzureDevOpsApplyService } from './azure-devops-apply-service-core.js';

const azureDevOpsApplyService = createAzureDevOpsApplyService({
  getNormalizedIssueFn: getNormalizedIssue,
  updateIssueFieldsFn: updateIssueFields,
  storeApplyAuditRecordFn: storeApplyAuditRecord,
});

export const { applySingleSuggestion, applyBatchSuggestions } = azureDevOpsApplyService;
