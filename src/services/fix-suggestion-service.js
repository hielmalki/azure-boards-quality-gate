import { analyzeIssue } from './analysis-service.js';
import { generateSuggestionWithLlm } from './llm-service.js';
import { createFixSuggestionService } from './fix-suggestion-service-core.js';

const fixSuggestionService = createFixSuggestionService({
  analyzeIssueFn: analyzeIssue,
  generateSuggestionWithLlmFn: generateSuggestionWithLlm,
});

export const { generateSingleFixSuggestion, generateBatchFixSuggestions } = fixSuggestionService;
