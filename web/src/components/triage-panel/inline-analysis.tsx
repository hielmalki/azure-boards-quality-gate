import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Loader2 } from 'lucide-react';
import type { BackendAnalysisProgress } from './triage-domain';

/**
 * Kleine Inline-Statusansicht während die Backend-Analyse läuft.
 * Zeigt verständliche Analyse-Schritte plus Fortschrittsbalken.
 */
export function InlineAnalysis({ progress }: { progress?: BackendAnalysisProgress | null }) {
  const STEPS = [
    { key: 'loading_ticket', label: 'Ticket wird geladen' },
    { key: 'preparing_rules', label: 'Regelsets werden vorbereitet' },
    { key: 'checking_requirements', label: 'Anforderungen werden geprüft' },
    { key: 'preparing_results', label: 'Ergebnisse werden aufbereitet' },
  ] as const;
  type StepStatus = 'pending' | 'active' | 'done';
  const progressStepKey = progress?.stepKey ?? 'loading_ticket';
  const progressStepIndex = Math.max(0, STEPS.findIndex(step => step.key === progressStepKey));
  const progressPercent =
    progress?.progressPercent ?? Math.round(((progressStepIndex + 1) / STEPS.length) * 100);
  const progressMessage = progress?.message ?? 'Analyse läuft…';
  const [showLongRunningHint, setShowLongRunningHint] = useState(false);
  const steps = STEPS.map((step, index): { label: string; status: StepStatus } => {
    if (index < progressStepIndex) {
      return { label: step.label, status: 'done' };
    }

    if (index === progressStepIndex) {
      return { label: step.label, status: 'active' };
    }

    return { label: step.label, status: 'pending' };
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLongRunningHint(true);
    }, 15000);

    return () => {
      clearTimeout(timer);
      setShowLongRunningHint(false);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="bg-white border border-gray-200 rounded-lg p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Loader2 size={14} className="text-blue-600 animate-spin" />
        <span className="text-sm text-gray-900">Ticket wird analysiert…</span>
      </div>
      <p className="text-xs text-gray-500 mb-2">{progressMessage}</p>
      {showLongRunningHint && (
        <p className="text-xs text-amber-700 mb-2">
          Das dauert etwas länger als gewöhnlich…
        </p>
      )}
      <div className="w-full h-1.5 bg-gray-100 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full bg-blue-500 rounded-full transition-all duration-200 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
        />
      </div>
      <div className="space-y-1.5">
        {steps.map((step, index) => (
          <div key={index} className="flex items-center gap-2">
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
    </motion.div>
  );
}
