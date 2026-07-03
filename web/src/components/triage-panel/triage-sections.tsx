import { type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react';
import { getSemanticScopeLabel, type Issue } from './triage-domain';

type TriageSectionsProps = {
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  totalHealthy: number;
  showCritical: boolean;
  showWarnings: boolean;
  showInfo: boolean;
  showHealthy: boolean;
  unresolvedCritical: Issue[];
  unresolvedWarnings: Issue[];
  infoIssues: Issue[];
  resolvedAsHealthy: Issue[];
  healthyIssues: Issue[];
  resolvedFulfilledFindingIds: Set<string>;
  onToggleCritical: () => void;
  onToggleWarnings: () => void;
  onToggleInfo: () => void;
  onToggleHealthy: () => void;
  renderCriticalIssue: (issue: Issue) => ReactNode;
  renderWarningIssue: (issue: Issue) => ReactNode;
};

/**
 * Darstellungskomponente für die Ergebnis-Gruppen der Anforderungsprüfung.
 *
 * Diese Komponente kapselt sektionsspezifisches JSX und das Auf-/Zuklapp-Verhalten
 * aus `TriagePanel` aus, damit sich die Hauptkomponente auf die Orchestrierung konzentrieren kann.
 */
export function TriageSections({
  criticalCount,
  warningCount,
  infoCount,
  totalHealthy,
  showCritical,
  showWarnings,
  showInfo,
  showHealthy,
  unresolvedCritical,
  unresolvedWarnings,
  infoIssues,
  resolvedAsHealthy,
  healthyIssues,
  resolvedFulfilledFindingIds,
  onToggleCritical,
  onToggleWarnings,
  onToggleInfo,
  onToggleHealthy,
  renderCriticalIssue,
  renderWarningIssue,
}: TriageSectionsProps) {
  return (
    <>
      <div>
        <button
          onClick={onToggleCritical}
          className="flex items-center gap-2 text-xs text-gray-400 tracking-wide mb-2 px-1 hover:text-gray-600 transition-colors w-full text-left"
        >
          {showCritical ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          KRITISCH ({criticalCount})
        </button>
        <AnimatePresence>
          {showCritical && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {unresolvedCritical.map(issue => renderCriticalIssue(issue))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div>
        <button
          onClick={onToggleWarnings}
          className="flex items-center gap-2 text-xs text-gray-400 tracking-wide mb-2 px-1 hover:text-gray-600 transition-colors w-full text-left"
        >
          {showWarnings ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          HINWEISE ({warningCount})
        </button>
        <AnimatePresence>
          {showWarnings && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {unresolvedWarnings.map(issue => renderWarningIssue(issue))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div>
        <button
          onClick={onToggleInfo}
          className="flex items-center gap-2 text-xs text-gray-400 tracking-wide mb-2 px-1 hover:text-gray-600 transition-colors w-full text-left"
        >
          {showInfo ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          NICHT TESTBAR ({infoCount})
        </button>
        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                {infoIssues.map(issue => (
                  <div key={issue.id} className="flex items-center gap-3 px-4 py-3">
                    <AlertTriangle size={16} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700">{issue.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{issue.description}</p>
                      {getSemanticScopeLabel(issue.semanticEvaluationScope) && (
                        <p className="text-xs text-gray-400 mt-1">
                          {getSemanticScopeLabel(issue.semanticEvaluationScope)}
                        </p>
                      )}
                      {issue.semanticEvidence.length > 0 && (
                        <p className="text-xs text-gray-400 mt-1">{issue.semanticEvidence[0]}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div>
        <button
          onClick={onToggleHealthy}
          className="flex items-center gap-2 text-xs text-gray-400 tracking-wide mb-2 px-1 hover:text-gray-600 transition-colors w-full text-left"
        >
          {showHealthy ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          BESTANDEN ({totalHealthy})
        </button>
        <AnimatePresence>
          {showHealthy && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {resolvedAsHealthy.map(issue => (
                  <div key={issue.id} className="flex items-center gap-2.5 px-4 py-2 border-b border-gray-50 last:border-b-0">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-xs text-gray-500">{issue.title}</span>
                    <span className="ml-auto text-xs text-emerald-500">Behoben</span>
                  </div>
                ))}
                {healthyIssues.map(issue => (
                  <div key={issue.id} className="flex items-center gap-2.5 px-4 py-2 border-b border-gray-50 last:border-b-0">
                    <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    <span className="text-xs text-gray-500">{issue.title}</span>
                    {resolvedFulfilledFindingIds.has(issue.id) && (
                      <span className="ml-auto text-xs text-emerald-500">Behoben</span>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

