import { useEffect, useRef, useState } from 'react';
import { invoke } from '../../api/invoke';
import {
  type FixSuggestionPayload,
  type FixSuggestionStreamResultResponse,
  type FixSuggestionStreamStartResponse,
  type Issue,
  getFixedCurrentStateText,
  getSuggestionTargetField,
} from './triage-domain';

type FixFlowState = 'idle' | 'analyzing' | 'generating' | 'ready' | 'editing' | 'applying' | 'applied';
type FixStep = { label: string; status: 'pending' | 'active' | 'done' };

type UseFixFlowParams = {
  issue: Issue;
  issueKey?: string | null;
  onApplied?: () => void | Promise<void>;
  onTokenUsageChanged?: () => void;
};

/**
 * Kapselt den Lebenszyklus der Einzelfund-Korrektur.
 *
 * Zuständigkeiten:
 * - KI-Korrektur-Generierung starten
 * - gestreamte Vorschlags-Chunks pollen
 * - Fix-Zustandsmaschine verwalten (analyzing -> generating -> ready -> apply)
 * - generierten Vorschlag in Jira übernehmen
 *
 * UI-Rendering ist bewusst in der `FixFlow`-Komponente belassen.
 */
export function useFixFlow({
  issue,
  issueKey,
  onApplied,
  onTokenUsageChanged,
}: UseFixFlowParams) {
  const [state, setState] = useState<FixFlowState>('idle');
  const [suggestionText, setSuggestionText] = useState('');
  const [editText, setEditText] = useState('');
  const [steps, setSteps] = useState<FixStep[]>([
    { label: 'Kontext analysieren', status: 'pending' },
    { label: 'Verbesserung generieren', status: 'pending' },
    { label: 'Qualität prüfen', status: 'pending' },
  ]);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [currentSuggestion, setCurrentSuggestion] = useState<FixSuggestionPayload | null>(null);
  const [showSlowRequestHint, setShowSlowRequestHint] = useState(false);
  const [streamedSuggestionText, setStreamedSuggestionText] = useState('');

  // Schützt den langen Poll-Loop vor State-Updates nach Unmount und vor
  // zwei gleichzeitigen Läufen (ein Erneut-Versuchen während ein vorheriger Poll noch läuft).
  const isMountedRef = useRef(true);
  const activeRunIdRef = useRef(0);

  const startFix = async () => {
    // Jeder zuvor laufende Poll-Loop wird durch diesen Run überschrieben.
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const isActive = () => isMountedRef.current && activeRunIdRef.current === runId;

    setState('analyzing');
    setFlowError(null);
    setShowSlowRequestHint(false);
    setSuggestionText('');
    setStreamedSuggestionText('');
    setEditText('');
    setCurrentSuggestion(null);
    setSteps(current => current.map((step, index) => ({ ...step, status: index === 0 ? 'active' : 'pending' })));

    let slowRequestTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      await new Promise(resolve => setTimeout(resolve, 350));

      if (!isActive()) return;

      setSteps(current =>
        current.map((step, index) => ({
          ...step,
          status: index === 0 ? 'done' : index === 1 ? 'active' : 'pending',
        }))
      );
      setState('generating');
      slowRequestTimer = setTimeout(() => {
        setShowSlowRequestHint(true);
      }, 15000);

      console.log('[Requirement Check] Starting OpenAI suggestion generation…', {
        issueKey,
        findingId: issue.id,
        findingTitle: issue.title,
      });

      const streamStartResult = await invoke<FixSuggestionStreamStartResponse>('startFixSuggestionStream', {
        issueKey,
        findingId: issue.id,
      });

      if (streamStartResult?.status === 'failed') {
        throw new Error(streamStartResult?.error?.message ?? 'Vorschlag konnte nicht generiert werden.');
      }

      const streamRunId = streamStartResult?.runId;

      if (!streamRunId) {
        throw new Error('Streaming-Durchlauf konnte nicht gestartet werden.');
      }

      let suggestionResult: FixSuggestionStreamResultResponse | null = null;

      const maxPollAttempts = 240;
      const pollDelayMs = 250;

      for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
        if (!isActive()) return;

        suggestionResult = await invoke<FixSuggestionStreamResultResponse>('getFixSuggestionStreamResult', {
          issueKey,
          findingId: issue.id,
          runId: streamRunId,
        });

        if (!isActive()) return;

        if (suggestionResult?.status === 'failed') {
          throw new Error(suggestionResult?.error?.message ?? 'Vorschlag konnte nicht generiert werden.');
        }

        if (suggestionResult?.partialText) {
          setStreamedSuggestionText(suggestionResult.partialText);
        }

        if (suggestionResult?.hasFirstChunk) {
          setSteps(current =>
            current.map((step, index) => ({
              ...step,
              status: index <= 1 ? 'done' : index === 2 ? 'active' : 'pending',
            }))
          );
        }

        if (suggestionResult?.status === 'completed' && suggestionResult?.suggestion) {
          break;
        }

        await new Promise(resolve => setTimeout(resolve, pollDelayMs));
      }

      console.log('[Requirement Check] OpenAI suggestion received:', suggestionResult);

      const fixedCurrentStateText = getFixedCurrentStateText(issue.id);
      const providerCurrentText = suggestionResult?.suggestion?.currentText?.trim();
      const currentText = fixedCurrentStateText ?? providerCurrentText ?? getFallbackCurrentText(issue);
      const suggestedText =
        suggestionResult?.suggestion?.suggestedText?.trim() ??
        suggestionResult?.partialText?.trim() ??
        '';

      if (!suggestedText) {
        throw new Error('OpenAI hat keinen verwertbaren Vorschlag zurückgegeben.');
      }

      await new Promise(resolve => setTimeout(resolve, 250));

      if (!isActive()) return;

      const formattedSuggestionText = formatSuggestionText(suggestedText);
      setStreamedSuggestionText(formattedSuggestionText);
      setSteps(current => current.map(step => ({ ...step, status: 'done' as const })));
      setSuggestionText(formattedSuggestionText);
      setEditText(formattedSuggestionText);
      setCurrentSuggestion({
        issueKey: suggestionResult?.issueKey ?? issueKey ?? null,
        findingId: issue.id,
        findingTitle: issue.title,
        targetField: suggestionResult?.suggestion?.targetField ?? getSuggestionTargetField(issue.id),
        status: 'completed',
        currentText,
        suggestedText: formattedSuggestionText,
        summary: suggestionResult?.suggestion?.summary ?? null,
        reasoning: suggestionResult?.suggestion?.reasoning ?? null,
        provider: null,
        model: null,
        error: null,
      });
      onTokenUsageChanged?.();
      setState('ready');
    } catch (error) {
      if (!isActive()) return;
      console.error('[Requirement Check] OpenAI suggestion failed', error);
      setSuggestionText('');
      setStreamedSuggestionText('');
      setEditText('');
      setFlowError(getFriendlySuggestionErrorMessage(error));
      setSteps(current => current.map(step => ({ ...step, status: 'pending' })));
      setState('idle');
    } finally {
      if (slowRequestTimer) {
        clearTimeout(slowRequestTimer);
      }
      if (isActive()) {
        setShowSlowRequestHint(false);
      }
    }
  };

  const applyFix = () => {
    setState('applying');
    void (async () => {
      try {
        const response = await invoke<{
          status: 'completed' | 'failed';
          error?: { message?: string } | null;
        }>('applyFixSuggestion', {
          issueKey,
          suggestion: {
            ...(currentSuggestion ?? {}),
            findingId: issue.id,
            findingTitle: issue.title,
            targetField: currentSuggestion?.targetField ?? getSuggestionTargetField(issue.id),
            currentText: currentSuggestion?.currentText ?? '',
            suggestedText: state === 'editing' ? editText : suggestionText,
          },
        });

        if (!isMountedRef.current) return;

        if (response?.status === 'failed') {
          throw new Error(response?.error?.message ?? 'Änderung konnte nicht in Jira übernommen werden.');
        }

        setState('applied');
        void Promise.resolve(onApplied?.()).catch(error => {
          console.error('[Requirement Check] Post-apply reanalysis failed.', error);
        });
      } catch (error) {
        if (!isMountedRef.current) return;
        setFlowError(error instanceof Error ? error.message : 'Änderung konnte nicht in Jira übernommen werden.');
        setState('ready');
      }
    })();
  };

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      void startFix();
    }, 300);
    return () => {
      // Laufenden Poll-Loop invalidieren, damit er keine weiteren setState-Aufrufe macht.
      isMountedRef.current = false;
      activeRunIdRef.current += 1;
      clearTimeout(timer);
    };
    // Der Hook startet bewusst genau einmal, wenn der Flow geöffnet wird.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enterEditing = () => {
    setState('editing');
  };

  const resetEditing = () => {
    setEditText(suggestionText);
    setState('ready');
  };

  const displayCurrentText = currentSuggestion?.currentText ?? issue.beforeText ?? '';

  return {
    state,
    suggestionText,
    editText,
    setEditText,
    steps,
    flowError,
    showSlowRequestHint,
    streamedSuggestionText,
    applyFix,
    startFix,
    enterEditing,
    resetEditing,
    displayCurrentText,
  };
}

function getFallbackCurrentText(issue: Issue) {
  const fallbackByFindingId: Record<string, string> = {
    acceptance_criteria_missing: 'Keine Akzeptanzkriterien definiert',
    title_missing: 'Kein Titel vorhanden',
    description_missing: 'Keine Beschreibung vorhanden',
  };

  if (fallbackByFindingId[issue.id]) {
    return fallbackByFindingId[issue.id];
  }

  return issue.beforeText ?? issue.description ?? '';
}

function formatSuggestionText(value: string) {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\n?(Beispiel:)/gi, '$1\n\n$2')
    .trim();
}

function getFriendlySuggestionErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
  const normalizedMessage = rawMessage.toLowerCase();

  const isTimeoutError =
    normalizedMessage.includes('timed out') ||
    normalizedMessage.includes('timeout') ||
    normalizedMessage.includes('time out');

  if (isTimeoutError) {
    return 'Die Anfrage hat zu lange gedauert und wurde abgebrochen. Bitte erneut versuchen.';
  }

  return rawMessage;
}

