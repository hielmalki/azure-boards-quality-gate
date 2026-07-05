import { getNormalizedIssue } from './issue-service.js';
import { generateTestCasesWithLlm, generateTestStepsWithLlm } from './llm-service.js';
import {
  createTestCaseWorkItem,
  updateIssueFields,
  fetchLinkedTestCases,
  fetchTestCaseSteps,
  updateTestCaseSteps,
} from '../gateways/azure-devops/work-item-gateway.js';
import { createTestCaseService } from './test-case-service-core.js';

const testCaseService = createTestCaseService({
  getNormalizedIssueFn: getNormalizedIssue,
  generateTestCasesWithLlmFn: generateTestCasesWithLlm,
  createTestCaseWorkItemFn: createTestCaseWorkItem,
  updateIssueFieldsFn: updateIssueFields,
  fetchLinkedTestCasesFn: fetchLinkedTestCases,
  generateTestStepsWithLlmFn: generateTestStepsWithLlm,
  fetchTestCaseStepsFn: fetchTestCaseSteps,
  updateTestCaseStepsFn: updateTestCaseSteps,
});

export const {
  generateTestCases,
  createTestCaseWorkItems,
  attachTestCasesToIssue,
  listExistingTestCases,
  generateStepsForExisting,
  appendStepsToTestCase,
} = testCaseService;
