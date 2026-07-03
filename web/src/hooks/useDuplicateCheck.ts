import { useState, useEffect, useRef } from 'react';
import { invoke } from '../api/invoke';

export type DuplicateCandidate = {
  key: string;
  summary: string;
  status: string;
  statusCategory: string;
};

type DuplicateCheckResult = {
  candidates: DuplicateCandidate[];
  keywords: string[];
  skipped: boolean;
  error: string | null;
};

type UseDuplicateCheckParams = {
  issueKey: string | null | undefined;
  summary: string | null | undefined;
  projectKey: string | null | undefined;
  enabled: boolean;
};

/**
 * Invokes the duplicate-check backend and returns potential duplicate tickets.
 * Only runs when `enabled` is true and the required fields are present.
 * Re-runs whenever issueKey changes (i.e. user navigates to a different ticket).
 */
export function useDuplicateCheck({ issueKey, summary, projectKey, enabled }: UseDuplicateCheckParams) {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([]);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(false);
  // hasCompleted wird true, sobald die Prüfung für den aktuellen Schlüssel abgeschlossen ist
  // (Erfolg oder Fehler), damit die UI „nie gelaufen" von „gelaufen, nichts gefunden" unterscheiden kann.
  const [hasCompleted, setHasCompleted] = useState(false);

  // trackedKey spiegelt den issueKey wider, für den wir State haben. Wenn der eingehende
  // issueKey abweicht, wird der State synchron während des Renders – vor dem Commit – zurückgesetzt,
  // damit der Konsument keine veralteten Kandidaten eines zuvor angezeigten Tickets sieht.
  const [trackedKey, setTrackedKey] = useState<string | null | undefined>(issueKey);
  if (issueKey !== trackedKey) {
    setTrackedKey(issueKey);
    setCandidates([]);
    setKeywords([]);
    setError(null);
    setSkipped(false);
    setHasCompleted(false);
    setIsLoading(Boolean(enabled && issueKey && summary && projectKey));
  }

  // Den letzten issueKey tracken, für den wir gelaufen sind – erneutes Laufen bei unzusammenhängenden Re-Renders vermeiden.
  const lastCheckedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !issueKey || !summary || !projectKey) {
      setCandidates([]);
      setKeywords([]);
      setSkipped(false);
      setError(null);
      setIsLoading(false);
      setHasCompleted(false);
      return;
    }

    // Nicht erneut laufen, wenn wir dieses Ticket in dieser Session bereits geprüft haben.
    if (lastCheckedKeyRef.current === issueKey) {
      return;
    }

    let cancelled = false;

    const run = async () => {
      setIsLoading(true);
      setError(null);
      setCandidates([]);

      try {
        const result = await invoke<DuplicateCheckResult>('checkDuplicates', {
          issueKey,
          summary,
          projectKey,
        });

        if (cancelled) return;

        lastCheckedKeyRef.current = issueKey;
        setCandidates(result?.candidates ?? []);
        setKeywords(result?.keywords ?? []);
        setSkipped(result?.skipped ?? false);
        setError(result?.error ?? null);
        setHasCompleted(true);
      } catch (err) {
        if (cancelled) return;
        setError('Duplicate check could not be completed.');
        setHasCompleted(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled, issueKey, summary, projectKey]);

  return { candidates, keywords, isLoading, error, skipped, hasCompleted };
}
