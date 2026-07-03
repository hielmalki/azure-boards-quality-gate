import { getStoredIssueAnalysis, setStoredIssueAnalysis } from '../repositories/analysis-repository.js';
import {
  analyzeIssue,
  buildCacheKeyFingerprint,
  normalizeActiveRulesets,
} from './analysis-service.js';
import { createAnalysisRunService } from './analysis-run-service-core.js';
import { logError, logInfo } from '../utils/logger.js';

const analysisRunService = createAnalysisRunService({
  analyzeIssueFn: analyzeIssue,
  getStoredIssueAnalysisFn: getStoredIssueAnalysis,
  setStoredIssueAnalysisFn: setStoredIssueAnalysis,
  logInfoFn: logInfo,
  logErrorFn: logError,
  // Den kanonischen Fingerprint + Normalisierung aus analysis-service verwenden, damit
  // der Cache-Key-Vergleich mit dem Fingerprint synchron bleibt, der neben jedem
  // abgeschlossenen Analyse-Ergebnis gespeichert wird.
  buildCacheKeyFingerprintFn: buildCacheKeyFingerprint,
  normalizeActiveRulesetsFn: normalizeActiveRulesets,
});

export const { startIssueAnalysis, getIssueAnalysisResult } = analysisRunService;
