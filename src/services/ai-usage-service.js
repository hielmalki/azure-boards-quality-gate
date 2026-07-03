import {
  getStoredAiUsage,
  setStoredAiUsage,
} from '../repositories/ai-usage-repository.js';
import { createAiUsageService } from './ai-usage-service-core.js';

const aiUsageService = createAiUsageService({
  getStoredAiUsageFn: getStoredAiUsage,
  setStoredAiUsageFn: setStoredAiUsage,
});

export const {
  getTokenUsage,
  recordUsage,
} = aiUsageService;
