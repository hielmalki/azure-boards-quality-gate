import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Sparkles,
  Zap,
} from 'lucide-react';
import { getSemanticScopeLabel, getSemanticStatusLabel, type AnalysisResult, type Issue } from './triage-domain';

const EFFORT_LABELS: Record<string, string> = {
  quick: 'Schnell',
  medium: '~2 Min.',
  long: '~5 Min.',
};

type IssueRowProps = {
  issue: Issue;
  issueKey?: string | null;
  issueContext?: AnalysisResult['issue'];
  severity: 'critical' | 'warning';
  onFixApplied?: () => void;
  isResolved?: boolean;
  renderFixFlow?: (input: {
    issue: Issue;
    issueKey?: string | null;
    issueContext?: AnalysisResult['issue'];
    onClose: () => void;
    onApplied: () => void;
  }) => ReactNode;
};

/**
 * Zeilenkomponente für einen Fund in „Kritisch" / „Hinweise".
 *
 * Verwaltet den lokalen Interaktionszustand der Zeile:
 * - Auf-/Zuklappen
 * - Einzelkorrektur-Flow ein-/ausblenden
 * - Übergängliche Ausblend-Animation nach Behebung
 */
export function IssueRow({
  issue,
  issueKey,
  issueContext,
  severity,
  onFixApplied,
  isResolved,
  renderFixFlow,
}: IssueRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [showFix, setShowFix] = useState(false);
  const [justResolved, setJustResolved] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);

  const iconColor = severity === 'critical' ? 'text-red-500' : 'text-amber-500';
  const Icon = severity === 'critical' ? AlertCircle : AlertTriangle;
  const effort = EFFORT_LABELS[issue.effort];
  const resolved = isResolved || justResolved;

  // Animationstimer sammeln, damit sie bei Unmount der Zeile abgebrochen werden können
  // (z. B. wenn eine Neu-Analyse die Zeile entfernt) – verhindert setState-after-unmount
  // und ein Feuern von onFixApplied aus einer bereits zerstörten Komponente.
  const resolveTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    return () => {
      resolveTimersRef.current.forEach(clearTimeout);
      resolveTimersRef.current = [];
    };
  }, []);

  const handleApplied = () => {
    setJustResolved(true);
    resolveTimersRef.current.push(
      setTimeout(() => {
        setShowFix(false);
        setExpanded(false);
        resolveTimersRef.current.push(
          setTimeout(() => {
            setFadingOut(true);
            resolveTimersRef.current.push(setTimeout(() => onFixApplied?.(), 300));
          }, 200)
        );
      }, 1800)
    );
  };

  if (isResolved && fadingOut) return null;

  if (fadingOut) {
    return (
      <motion.div
        initial={{ height: 'auto', opacity: 1 }}
        animate={{ height: 0, opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden border-b border-gray-100 last:border-b-0"
      />
    );
  }

  if (resolved && !showFix) {
    return (
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0.5 }}
        transition={{ delay: 0.5, duration: 0.3 }}
        className="border-b border-gray-100 last:border-b-0"
      >
        <div className="flex items-center gap-3 px-4 py-2.5">
          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
          <span className="text-sm text-gray-400 line-through flex-1">{issue.title}</span>
          <span className="text-xs text-emerald-500">Behoben</span>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <Icon size={16} className={`${iconColor} shrink-0`} />
        <span className="text-sm text-gray-900 flex-1">{issue.title}</span>

        {issue.hasAIFix && effort && !showFix && (
          <span className="hidden sm:flex items-center gap-1 text-xs text-gray-400 mr-1">
            {issue.effort === 'quick' ? (
              <Zap size={10} className="text-amber-400" />
            ) : (
              <Clock size={10} />
            )}
            {effort}
          </span>
        )}

        {issue.hasAIFix && !showFix && (
          <button
            onClick={(event) => {
              event.stopPropagation();
              setShowFix(true);
              setExpanded(true);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
          >
            <Sparkles size={11} />
            Fix
          </button>
        )}
        {expanded ? (
          <ChevronDown size={14} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-400 shrink-0" />
        )}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pl-11">
              <p className="text-xs text-gray-500 mb-1">{issue.description}</p>
              {issue.impact && (
                <p className="text-xs text-gray-400">{issue.impact}</p>
              )}
              {(issue.semanticEvaluationStatus || issue.semanticEvidence.length > 0) && (
                <div className="mt-2.5 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-2">
                  {getSemanticScopeLabel(issue.semanticEvaluationScope) && (
                    <p className="text-[11px] text-gray-500 mb-1">
                      {getSemanticScopeLabel(issue.semanticEvaluationScope)}
                    </p>
                  )}
                  {getSemanticStatusLabel(issue.semanticEvaluationStatus, issue.evaluatorType) && (
                    <p className="text-[11px] text-gray-600 mb-1">
                      {getSemanticStatusLabel(issue.semanticEvaluationStatus, issue.evaluatorType)}
                    </p>
                  )}
                  {issue.semanticEvidence.length > 0 && (
                    <ul className="space-y-1">
                      {issue.semanticEvidence.map((evidenceLine, evidenceIndex) => (
                        <li key={`${issue.id}-evidence-${evidenceIndex}`} className="text-[11px] text-gray-500">
                          {evidenceLine}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {showFix && issue.hasAIFix && renderFixFlow?.({
                issue,
                issueKey,
                issueContext,
                onClose: () => setShowFix(false),
                onApplied: handleApplied,
              })}

              {!issue.hasAIFix && (
                <button
                  className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 transition-colors"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink size={11} />
                  Im Ticket manuell bearbeiten
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

