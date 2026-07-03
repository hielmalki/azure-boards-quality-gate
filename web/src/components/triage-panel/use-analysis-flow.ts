import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '../../api/invoke';
import {
  type AnalysisResult,
  type BackendAnalysisProgress,
  type NormalizedIssueResponse,
  logAnalysisStep,
} from './triage-domain';

type UseAnalysisFlowParams = {
  activeRulesets: string[];
  rulesetsInitialized: boolean;
  initialIsAnalyzing?: boolean;
  onAcceptedAnalysis?: () => void;
};

type AnalysisRunStartResponse = {
  runId?: string;
  issueKey: string | null;
  status: string;
  resultAvailable: boolean;
  error: { message: string } | null;
  progress?: BackendAnalysisProgress | null;
};

type AnalysisRunResultResponse = {
  status: string;
  resultAvailable: boolean;
  result: AnalysisResult | null;
  error: { message: string } | null;
  progress?: BackendAnalysisProgress | null;
};

type RunBackendAnalysisOptions = {
  withLogging?: boolean;
  showInlineProgress?: boolean;
};

/**
 * Kapselt die Orchestrierung der Anforderungsprüfungs-Analyse.
 *
 * Zuständigkeiten:
 * - Backend-Analyse starten
 * - Analyse-Ergebnis pollen
 * - Lade-/Fortschritts-/Fehlerzustand verwalten
 * - explizite Post-Apply-Reanalyse-Aktion bereitstellen
 *
 * Der Hook hält Backend-Analyse-Belange aus der UI-Rendering-Komponente heraus.
 */
export function useAnalysisFlow({
  activeRulesets,
  rulesetsInitialized,
  initialIsAnalyzing = false,
  onAcceptedAnalysis,
}: UseAnalysisFlowParams) {
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<BackendAnalysisProgress | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(initialIsAnalyzing);
  const [postApplyReanalysisInProgress, setPostApplyReanalysisInProgress] = useState(false);
  const [postApplyReanalysisError, setPostApplyReanalysisError] = useState<string | null>(null);
  const analysisRunSequenceRef = useRef(0);
  const latestAnalysisRunIdRef = useRef(0);
  const isMountedRef = useRef(true);

  // Nur true, solange dieser Run noch der aktuellste ist UND die Komponente gemountet ist –
  // verhindert State-Updates von einem überschriebenen Run oder nach Unmount.
  const isCurrentRun = useCallback(
    (runId: number) => isMountedRef.current && runId === latestAnalysisRunIdRef.current,
    []
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const runBackendAnalysis = useCallback(async (options?: RunBackendAnalysisOptions) => {
    const withLogging = options?.withLogging ?? false;
    const showInlineProgress = options?.showInlineProgress ?? false;
    const runId = analysisRunSequenceRef.current + 1;
    analysisRunSequenceRef.current = runId;
    latestAnalysisRunIdRef.current = runId;
    const runStartedAtMs = Date.now();
    let lastStepLoggedAtMs = runStartedAtMs;

    if (showInlineProgress) {
      setIsAnalyzing(true);
      setAnalysisProgress({
        stepKey: 'loading_ticket',
        stepIndex: 0,
        totalSteps: 4,
        progressPercent: 25,
        message: 'Ticket wird geladen',
      });
    }

    const logTimedStep = (step: number, message: string, details?: Record<string, unknown>) => {
      if (!withLogging) {
        return;
      }

      const nowMs = Date.now();
      const timingDetails = {
        stepDurationMs: nowMs - lastStepLoggedAtMs,
        runElapsedMs: nowMs - runStartedAtMs,
      };
      lastStepLoggedAtMs = nowMs;

      logAnalysisStep(step, message, {
        ...(details ?? {}),
        ...timingDetails,
      });
    };

    try {
      if (withLogging) {
        logAnalysisStep(1, `[Run ${runId}] Lade Jira-Issue-Kontext…`);
      }

      const normalizedIssue = await invoke<NormalizedIssueResponse | null>('getNormalizedIssue');

      logTimedStep(2, `[Run ${runId}] Jira-Issue-Kontext geladen.`, {
        runId,
        issueKey: normalizedIssue?.key ?? null,
        hasDescription: Boolean(normalizedIssue?.description),
        labelCount: normalizedIssue?.labels?.length ?? 0,
      });

      logTimedStep(3, `[Run ${runId}] Starte Backend-Analyse…`, {
        runId,
        activeRulesets,
      });

      const analysisRun = await invoke<AnalysisRunStartResponse>('startAnalysis', {
        activeRulesetIds: activeRulesets,
        normalizedIssue,
      });

      if (analysisRun?.status === 'failed') {
        throw new Error(analysisRun?.error?.message ?? 'Analyse fehlgeschlagen');
      }

      if (isCurrentRun(runId)) {
        setAnalysisProgress(analysisRun?.progress ?? null);
      }

      logTimedStep(4, `[Run ${runId}] Analyse im Backend gestartet.`, {
        runId,
        issueKey: analysisRun?.issueKey ?? null,
        analysisRunId: analysisRun?.runId ?? null,
        status: analysisRun?.status ?? null,
      });

      let analysisResponse: AnalysisRunResultResponse | null = null;
      const pollingIssueKey = analysisRun?.issueKey ?? normalizedIssue?.key ?? null;

      const maxPollingDurationMs = 15_000;
      const pollDelayMs = 250;
      const pollingStartedAtMs = Date.now();

      while (Date.now() - pollingStartedAtMs < maxPollingDurationMs) {
        analysisResponse = await invoke<AnalysisRunResultResponse>('getAnalysisResult', {
          issueKey: pollingIssueKey,
        });

        if (analysisResponse?.status === 'failed') {
          throw new Error(analysisResponse?.error?.message ?? 'Analyse fehlgeschlagen');
        }

        if (isCurrentRun(runId)) {
          setAnalysisProgress(analysisResponse?.progress ?? null);
        }

        if (analysisResponse?.status === 'completed' && analysisResponse?.resultAvailable) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, pollDelayMs));
      }

      let analysis = analysisResponse?.result ?? null;

      if (!analysisResponse?.resultAvailable || !analysis) {
        const timeoutSeconds = Math.round((Date.now() - pollingStartedAtMs) / 1000);

        logTimedStep(5, `[Run ${runId}] Polling-Timeout, starte direkten Analyse-Fallback…`, {
          runId,
          issueKey: pollingIssueKey,
          timeoutSeconds,
        });

        analysis = await invoke<AnalysisResult>('analyzeIssue', {
          issueKey: pollingIssueKey,
          activeRulesetIds: activeRulesets,
        });

        if (!analysis) {
          throw new Error(`Analyseergebnis nicht verfügbar nach ${timeoutSeconds} s.`);
        }
      }

      if (!isCurrentRun(runId)) {
        logTimedStep(5, `[Run ${runId}] Veraltetes Analyse-Ergebnis verworfen.`, {
          runId,
          latestRunId: latestAnalysisRunIdRef.current,
        });
        return null;
      }

      setAnalysisResult(analysis);
      setAnalysisError(null);
      onAcceptedAnalysis?.();

      logTimedStep(6, `[Run ${runId}] Analyse-Ergebnis geladen.`, {
        runId,
        issueKey: analysis?.issue?.key ?? null,
        score: analysis?.score ?? null,
        summary: analysis?.summary ?? null,
        activeRulesetIds: analysis?.activeRulesetIds ?? [],
      });

      const allFindings = [
        ...(analysis?.findings?.critical ?? []),
        ...(analysis?.findings?.warnings ?? []),
        ...(analysis?.findings?.fulfilled ?? []),
      ];

      logTimedStep(7, `[Run ${runId}] Findings für die UI aufbereitet.`, {
        runId,
        totalFindings: allFindings.length,
        critical: analysis?.findings?.critical?.length ?? 0,
        warnings: analysis?.findings?.warnings?.length ?? 0,
        info: analysis?.findings?.info?.length ?? 0,
        fulfilled: analysis?.findings?.fulfilled?.length ?? 0,
      });

      return analysis;
    } finally {
      if (showInlineProgress && isCurrentRun(runId)) {
        setIsAnalyzing(false);
        setAnalysisProgress(null);
      }
    }
  }, [activeRulesets, onAcceptedAnalysis, isCurrentRun]);

  const runPostApplyReanalysis = useCallback(async () => {
    setPostApplyReanalysisInProgress(true);
    setPostApplyReanalysisError(null);

    try {
      await runBackendAnalysis();
    } catch (error) {
      setPostApplyReanalysisError(
        error instanceof Error ? error.message : 'Analyse-Ergebnis konnte nicht aktualisiert werden.'
      );
    } finally {
      setPostApplyReanalysisInProgress(false);
    }
  }, [runBackendAnalysis]);

  useEffect(() => {
    let isMounted = true;

    async function inspectIssueAnalysis() {
      try {
        if (!isMounted) {
          return;
        }
        await runBackendAnalysis({ withLogging: true, showInlineProgress: true });
      } catch (error) {
        if (isMounted) {
          setAnalysisResult(null);
          setAnalysisError(error instanceof Error ? error.message : 'Unbekannter Analysefehler');
        }
        console.error('[Requirement Check] Analyse-Flow fehlgeschlagen.', error);
      }
    }

    if (!rulesetsInitialized) {
      return () => {
        isMounted = false;
      };
    }

    if (activeRulesets.length > 0) {
      void inspectIssueAnalysis();
    }

    return () => {
      isMounted = false;
    };
  }, [rulesetsInitialized, activeRulesets, runBackendAnalysis]);

  return {
    analysisResult,
    analysisError,
    analysisProgress,
    isAnalyzing,
    postApplyReanalysisInProgress,
    postApplyReanalysisError,
    runPostApplyReanalysis,
  };
}
