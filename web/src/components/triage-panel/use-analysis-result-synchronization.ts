import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { AnalysisResult } from './triage-domain';
import { loadPersistedResolvedFindingIds } from './triage-storage';

type UseAnalysisResultSynchronizationOptions = {
  analysisResult: AnalysisResult | null;
  setScore: Dispatch<SetStateAction<number>>;
  setPreviousScore: Dispatch<SetStateAction<number | null>>;
  setResolvedFulfilledFindingIds: Dispatch<SetStateAction<Set<string>>>;
};

/**
 * Synchronizes UI state derived from backend analysis results.
 *
 * Responsibilities:
 * - apply backend score to the UI score state
 * - reset previous-score transition after fresh backend result
 * - restore persisted fulfilled markers that are still present in backend findings
 */
export function useAnalysisResultSynchronization({
  analysisResult,
  setScore,
  setPreviousScore,
  setResolvedFulfilledFindingIds,
}: UseAnalysisResultSynchronizationOptions) {
  useEffect(() => {
    if (!analysisResult || typeof analysisResult.score !== 'number') {
      return;
    }

    setScore(analysisResult.score);
    setPreviousScore(null);
  }, [analysisResult, setScore, setPreviousScore]);

  useEffect(() => {
    const issueKey = analysisResult?.issue?.key ?? null;
    const persistedFindingIds = loadPersistedResolvedFindingIds(issueKey);
    const fulfilledFindingIds = new Set(
      (analysisResult?.findings?.fulfilled ?? []).map(finding => finding.id)
    );

    const visiblePersistedFindingIds = new Set(
      [...persistedFindingIds].filter(findingId => fulfilledFindingIds.has(findingId))
    );

    setResolvedFulfilledFindingIds(visiblePersistedFindingIds);
  }, [analysisResult, setResolvedFulfilledFindingIds]);
}
