import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { type Issue } from './triage-domain';
import { getResolvedFulfilledFindingId, persistResolvedFindingIds } from './triage-storage';

type UseFixApplyFlowOptions = {
  score: number;
  currentIssueKey: string | null;
  fixableIssues: Issue[];
  runPostApplyReanalysis: () => Promise<void>;
  setPreviousScore: Dispatch<SetStateAction<number | null>>;
  setScore: Dispatch<SetStateAction<number>>;
  setFixedCount: Dispatch<SetStateAction<number>>;
  setResolvedIssues: Dispatch<SetStateAction<Set<string>>>;
  setResolvedFulfilledFindingIds: Dispatch<SetStateAction<Set<string>>>;
};

/**
 * Encapsulates optimistic UI updates that happen after applying AI fixes.
 *
 * This hook updates local score/resolved state immediately and then triggers
 * backend reanalysis so the UI can converge to backend truth once finished.
 */
export function useFixApplyFlow({
  score,
  currentIssueKey,
  fixableIssues,
  runPostApplyReanalysis,
  setPreviousScore,
  setScore,
  setFixedCount,
  setResolvedIssues,
  setResolvedFulfilledFindingIds,
}: UseFixApplyFlowOptions) {
  const handleSingleFixApplied = useCallback(async (issue: Issue) => {
    const impact = issue.scoreImpact ?? 8;
    const fulfilledFindingId = getResolvedFulfilledFindingId(issue.id);

    setPreviousScore(score);
    setScore(current => Math.min(100, current + impact));
    setFixedCount(count => count + 1);
    setResolvedIssues(current => new Set(current).add(issue.id));
    setResolvedFulfilledFindingIds(current => new Set(current).add(fulfilledFindingId));
    persistResolvedFindingIds(currentIssueKey, [fulfilledFindingId]);

    await runPostApplyReanalysis();
  }, [
    score,
    currentIssueKey,
    runPostApplyReanalysis,
    setPreviousScore,
    setScore,
    setFixedCount,
    setResolvedIssues,
    setResolvedFulfilledFindingIds,
  ]);

  const handleBatchApplied = useCallback(async (count: number) => {
    const totalImpact = fixableIssues.reduce((sum, issue) => sum + (issue.scoreImpact ?? 8), 0);
    const fulfilledFindingIds = fixableIssues.map(issue => getResolvedFulfilledFindingId(issue.id));

    setPreviousScore(score);
    setScore(current => Math.min(100, current + totalImpact));
    setFixedCount(current => current + count);
    setResolvedIssues(current => {
      const next = new Set(current);
      fixableIssues.forEach(issue => next.add(issue.id));
      return next;
    });
    setResolvedFulfilledFindingIds(current => {
      const next = new Set(current);
      fulfilledFindingIds.forEach(findingId => next.add(findingId));
      return next;
    });
    persistResolvedFindingIds(currentIssueKey, fulfilledFindingIds);

    await runPostApplyReanalysis();
  }, [
    score,
    currentIssueKey,
    fixableIssues,
    runPostApplyReanalysis,
    setPreviousScore,
    setScore,
    setFixedCount,
    setResolvedIssues,
    setResolvedFulfilledFindingIds,
  ]);

  return {
    handleSingleFixApplied,
    handleBatchApplied,
  };
}
