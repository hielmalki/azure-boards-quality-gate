import { analyzeIssue } from './analysis-service.js';
import { generateSuggestionWithLlmStream } from './llm-service.js';
import { createFixSuggestionStreamService } from './fix-suggestion-stream-service-core.js';
import {
  getFixSuggestionRun,
  setFixSuggestionRun,
} from '../repositories/fix-suggestion-run-repository.js';

const fixSuggestionStreamService = createFixSuggestionStreamService({
  analyzeIssueFn: analyzeIssue,
  generateSuggestionWithLlmStreamFn: generateSuggestionWithLlmStream,
  getFixSuggestionRunFn: getFixSuggestionRun,
  setFixSuggestionRunFn: setFixSuggestionRun,
});

export const {
  startSingleFixSuggestionStream,
  getSingleFixSuggestionStreamResult,
} = fixSuggestionStreamService;
