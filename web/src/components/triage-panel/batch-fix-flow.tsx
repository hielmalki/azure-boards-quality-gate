import { useEffect, useRef, useState } from 'react';
import { invoke } from '../../api/invoke';
import { motion } from 'motion/react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import type { FixSuggestionPayload, Issue } from './triage-domain';

/**
 * Batch-Fix-Flow für "Alle beheben":
 * 1) Vorschläge für alle Findings generieren
 * 2) Vorschläge anzeigen und bestätigen lassen
 * 3) Alle verwertbaren Vorschläge in Jira übernehmen
 */
export function BatchFixFlow({
  issues,
  issueKey,
  activeRulesets,
  onClose,
  onAllApplied,
  onTokenUsageChanged,
}: {
  issues: Issue[];
  issueKey?: string | null;
  activeRulesets: string[];
  onClose: () => void;
  onAllApplied?: (count: number) => void | Promise<void>;
  onTokenUsageChanged?: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [phase, setPhase] = useState<'processing' | 'confirm' | 'applying' | 'applied'>('processing');
  const [suggestionPreviewById, setSuggestionPreviewById] = useState<Record<string, string>>({});
  const [batchSuggestions, setBatchSuggestions] = useState<FixSuggestionPayload[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [applySummary, setApplySummary] = useState<{ succeeded: number; failed: number }>({
    succeeded: 0,
    failed: 0,
  });
  const completedSuggestions = batchSuggestions.filter(entry => entry.status === 'completed');
  const failedSuggestions = batchSuggestions.filter(entry => entry.status === 'failed');

  // Verfolgt den tatsächlichen Mount-Zustand, damit eine laufende Anfrage aus einem
  // Effect-Durchlauf nicht verworfen wird, nur weil ein unabhängiges Re-Render denselben
  // Effect erneut ausgeführt hat.
  const isMountedRef = useRef(true);
  // Stellt sicher, dass die (aufwändige, Token-kostende) Batch-Anfrage pro Eintritt
  // in die 'processing'-Phase höchstens einmal ausgelöst wird, auch wenn Abhängigkeiten
  // während der Ausführung wechseln.
  const hasStartedRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== 'processing') {
      hasStartedRef.current = false;
      return;
    }

    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;

    async function loadBatchSuggestions() {
      try {
        const response = await invoke<{
          suggestions: FixSuggestionPayload[];
        }>('generateBatchFixSuggestions', {
          issueKey,
          activeRulesetIds: activeRulesets,
          findingIds: issues.map(issue => issue.id),
        });

        if (!isMountedRef.current) {
          return;
        }

        const nextSuggestionPreviewById = Object.fromEntries(
          (response?.suggestions ?? []).map(entry => [
            entry.findingId,
            entry.suggestedText?.trim() ?? '',
          ])
        );

        setBatchSuggestions(response?.suggestions ?? []);
        setSuggestionPreviewById(nextSuggestionPreviewById);
        setCurrentIndex(Math.max(issues.length - 1, 0));
        onTokenUsageChanged?.();
        setPhase('confirm');
      } catch (_error) {
        if (!isMountedRef.current) {
          return;
        }

        setBatchError('Batch-Vorschläge konnten nicht vollständig geladen werden.');
        setCurrentIndex(Math.max(issues.length - 1, 0));
        setPhase('confirm');
      }
    }

    void loadBatchSuggestions();
  }, [activeRulesets, issueKey, issues, onTokenUsageChanged, phase]);

  const handleApply = () => {
    setPhase('applying');
    void (async () => {
      try {
        const response = await invoke<{
          summary: { succeeded: number; failed: number };
        }>('applyBatchFixSuggestions', {
          issueKey,
          suggestions: completedSuggestions
            .map(entry => ({
              ...entry,
              suggestedText: entry.suggestedText,
            })),
        });

        const appliedCount = response?.summary?.succeeded ?? 0;
        const failedCount = response?.summary?.failed ?? 0;
        setApplySummary({
          succeeded: appliedCount,
          failed: failedCount,
        });

        if (failedCount > 0) {
          setBatchError(`${failedCount} Änderungen konnten nicht in Jira übernommen werden.`);
        }

        setPhase('applied');
        void Promise.resolve(onAllApplied?.(appliedCount)).catch(error => {
          console.error('[Requirement Check] Post-apply batch reanalysis failed.', error);
        });
      } catch (error) {
        setBatchError(
          error instanceof Error
            ? error.message
            : 'Batch-Änderungen konnten nicht in Jira übernommen werden.'
        );
        setPhase('confirm');
      }
    })();
  };

  if (phase === 'processing') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-gray-200 rounded-lg p-4 mb-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Loader2 size={14} className="text-blue-600 animate-spin" />
          <span className="text-sm text-gray-700">Alle Probleme werden analysiert…</span>
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X size={14} />
          </button>
        </div>
        <div className="space-y-1.5">
          {issues.map((issue, index) => (
            <div key={issue.id} className="flex items-center gap-2">
              {index < currentIndex ? (
                <Check size={12} className="text-emerald-600" />
              ) : index === currentIndex ? (
                <Loader2 size={12} className="text-blue-600 animate-spin" />
              ) : (
                <div className="w-3 h-3 rounded-full border border-gray-300" />
              )}
              <span className={`text-xs ${index <= currentIndex ? 'text-gray-700' : 'text-gray-400'}`}>
                {issue.title}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  if (phase === 'applied') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-gray-200 rounded-lg p-4 mb-4"
      >
        <div className="flex items-center gap-2">
          <Check size={14} className="text-emerald-600" />
          <span className="text-sm text-emerald-700">
            {applySummary.succeeded} Verbesserungen in Jira übernommen
          </span>
        </div>
      </motion.div>
    );
  }

  if (phase === 'applying') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-gray-200 rounded-lg p-4 mb-4"
      >
        <div className="flex items-center gap-2">
          <Loader2 size={14} className="text-blue-600 animate-spin" />
          <span className="text-sm text-gray-700">Änderungen werden in Jira übernommen…</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-gray-200 rounded-lg p-4 mb-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Check size={14} className="text-emerald-600" />
        <span className="text-sm text-gray-700">{completedSuggestions.length} Vorschläge generiert</span>
        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-2 mb-3">
        {issues.map(issue => (
          <div key={issue.id} className="flex items-start gap-2 text-xs">
            {suggestionPreviewById[issue.id] ? (
              <Check size={10} className="text-emerald-500 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle size={10} className="text-amber-500 mt-0.5 shrink-0" />
            )}
            <div>
              <span className="text-gray-700">{issue.title}</span>
              {suggestionPreviewById[issue.id] && (
                <p className="text-gray-400 mt-0.5 whitespace-pre-line break-words">
                  {suggestionPreviewById[issue.id]}
                </p>
              )}
              {!suggestionPreviewById[issue.id] && (
                <p className="text-amber-600 mt-0.5">Kein verwertbarer KI-Vorschlag verfügbar</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {batchError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2.5 mb-3">
          {batchError}
        </div>
      )}

      {failedSuggestions.length > 0 && !batchError && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5 mb-3">
          {failedSuggestions.length} Vorschläge konnten nicht automatisch vorbereitet werden und werden nicht übernommen.
        </div>
      )}

      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5 flex items-start gap-2 mb-3">
        <AlertTriangle size={12} className="mt-0.5 shrink-0" />
        <span>{completedSuggestions.length} Änderungen werden direkt in das Jira-Ticket geschrieben.</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleApply}
          disabled={completedSuggestions.length === 0}
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          <Check size={14} />
          Alle übernehmen
        </button>
        <button
          onClick={onClose}
          className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          Abbrechen
        </button>
      </div>
    </motion.div>
  );
}
