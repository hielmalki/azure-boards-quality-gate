import { useMemo } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, ArrowDown, Check, Loader2, Pencil, Sparkles, X } from 'lucide-react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useFixFlow } from './use-fix-flow';
import type { AnalysisResult, Issue } from './triage-domain';

/**
 * Detail-Flow für einzelne KI-Verbesserungen:
 * Vorschlag generieren, optional bearbeiten und anschließend nach Jira übernehmen.
 */
export function FixFlow({
  issue,
  issueKey,
  issueContext,
  onClose,
  onApplied,
  onTokenUsageChanged,
}: {
  issue: Issue;
  issueKey?: string | null;
  issueContext?: AnalysisResult['issue'];
  onClose: () => void;
  onApplied?: () => void | Promise<void>;
  onTokenUsageChanged?: () => void;
}) {
  const {
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
  } = useFixFlow({
    issue,
    issueKey,
    onApplied,
    onTokenUsageChanged,
  });

  const streamedSuggestionHtml = useMemo(() => {
    if (!streamedSuggestionText.trim()) {
      return '';
    }

    const parsedMarkdown = marked.parse(streamedSuggestionText, { async: false });
    const html = typeof parsedMarkdown === 'string' ? parsedMarkdown : '';
    return DOMPurify.sanitize(html);
  }, [streamedSuggestionText]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="mt-3 border border-gray-200 rounded-[10px] bg-white">
        {(state === 'analyzing' || state === 'generating') && (
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-2.5">
              <Loader2 size={14} className="text-blue-600 animate-spin" />
              <span className="text-xs text-gray-500">KI-Agent arbeitet…</span>
            </div>
            {showSlowRequestHint && (
              <div className="mb-2.5 px-2.5 py-2 rounded-[6px] border border-amber-200 bg-amber-50 text-[12px] leading-5 text-amber-800">
                Diese Anfrage dauert etwas länger als gewöhnlich. Bitte warten – wir arbeiten noch daran.
              </div>
            )}
            <div className="space-y-1.5">
              {steps.map((step) => (
                <div key={step.label} className="flex items-center gap-2">
                  {step.status === 'done' ? (
                    <Check size={12} className="text-emerald-600" />
                  ) : step.status === 'active' ? (
                    <Loader2 size={12} className="text-blue-600 animate-spin" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border border-gray-300" />
                  )}
                  <span className={`text-xs ${step.status === 'done' ? 'text-gray-500' : step.status === 'active' ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {streamedSuggestionHtml && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="text-xs text-emerald-600 flex items-center gap-1 mb-1.5">
                  <Sparkles size={10} />
                  Vorschlag wird gerade generiert
                </div>
                <div
                  className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-[4px] text-sm leading-5 text-gray-800 prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: streamedSuggestionHtml }}
                />
              </div>
            )}
          </div>
        )}

        {(state === 'ready' || state === 'editing' || state === 'applying' || state === 'applied') && (
          <div className="px-4 py-3 space-y-3">
            <div className="space-y-1">
              <div className="text-xs text-gray-400">Aktuell</div>
              <div className="min-h-[38px] px-3 py-2 bg-gray-50 border border-gray-200 rounded-[4px] text-sm leading-5 text-gray-500 line-through whitespace-pre-line">
                {displayCurrentText}
              </div>
            </div>
            <div className="flex justify-center py-0.5">
              <ArrowDown size={13} className="text-gray-300" />
            </div>

            <div className="space-y-1">
              <div className="text-xs text-emerald-600 flex items-center gap-1">
                <Sparkles size={10} />
                {state === 'editing' ? 'Vorschlag bearbeiten' : 'Vorschlag'}
              </div>
              {state === 'editing' ? (
                <textarea
                  value={editText}
                  onChange={event => setEditText(event.target.value)}
                  rows={Math.max(3, editText.split('\n').length + 1)}
                  className="w-full px-3 py-2 bg-white border border-blue-300 rounded-[4px] text-sm leading-5 text-gray-800 whitespace-pre-line outline-none resize-none focus:border-blue-400 transition-colors"
                  autoFocus
                />
              ) : (
                <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-[4px] text-sm leading-5 text-gray-800 whitespace-pre-line">
                  {suggestionText}
                </div>
              )}
            </div>

            {state === 'applied' ? (
              <div className="flex items-center gap-2 py-1">
                <Check size={14} className="text-emerald-600" />
                <span className="text-sm text-emerald-700">Änderung in Jira übernommen</span>
              </div>
            ) : state === 'editing' ? (
              <div className="flex gap-2">
                <button
                  onClick={applyFix}
                  disabled={state !== 'editing'}
                  className="flex-1 flex items-center justify-center gap-2 h-[38px] px-3 bg-gray-900 text-white text-sm rounded-[8px] hover:bg-gray-800 transition-colors"
                >
                  <Check size={14} />
                  In Jira übernehmen
                </button>
                <button
                  onClick={() => {
                    resetEditing();
                  }}
                  className="px-3 h-[38px] text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors"
                >
                  Zurücksetzen
                </button>
                <button
                  onClick={onClose}
                  className="w-[30px] h-[38px] flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={applyFix}
                  disabled={state === 'applying'}
                  className="flex-1 flex items-center justify-center gap-2 h-[38px] px-3 bg-gray-900 text-white text-sm rounded-[8px] hover:bg-gray-800 transition-colors disabled:opacity-60"
                >
                  {state === 'applying' ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Wird übernommen…
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      In Jira übernehmen
                    </>
                  )}
                </button>
                <button
                  onClick={enterEditing}
                  className="w-[116px] h-[38px] flex items-center justify-center gap-1.5 px-3 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors"
                >
                  <Pencil size={12} />
                  Bearbeiten
                </button>
                <button
                  onClick={onClose}
                  className="w-[30px] h-[38px] flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {state === 'idle' && flowError && (
          <div className="px-4 py-3">
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="mb-1">Vorschlag konnte nicht generiert werden.</p>
                <p className="text-xs text-red-600">{flowError}</p>
              </div>
              <button
                onClick={() => void startFix()}
                className="px-2 py-1 text-xs text-red-700 border border-red-200 rounded hover:bg-red-100 transition-colors"
              >
                Erneut versuchen
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
