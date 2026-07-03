import { useEffect, useState } from 'react';

type UseSectionVisibilityOptions = {
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  totalHealthy: number;
};

/**
 * Centralizes expand/collapse state for triage result sections.
 *
 * Behavior contract:
 * - Sections default to expanded when they contain items.
 * - Users can always toggle sections manually.
 * - When a section becomes empty, local toggle state resets to null.
 */
export function useSectionVisibility({
  criticalCount,
  warningCount,
  infoCount,
  totalHealthy,
}: UseSectionVisibilityOptions) {
  const [criticalExpanded, setCriticalExpanded] = useState<boolean | null>(null);
  const [warningsExpanded, setWarningsExpanded] = useState<boolean | null>(null);
  const [infoExpanded, setInfoExpanded] = useState<boolean | null>(null);
  const [healthyExpanded, setHealthyExpanded] = useState<boolean | null>(null);

  useEffect(() => {
    if (criticalCount === 0) {
      setCriticalExpanded(null);
    }
  }, [criticalCount]);

  useEffect(() => {
    if (warningCount === 0) {
      setWarningsExpanded(null);
    }
  }, [warningCount]);

  useEffect(() => {
    if (infoCount === 0) {
      setInfoExpanded(null);
    }
  }, [infoCount]);

  useEffect(() => {
    if (totalHealthy === 0) {
      setHealthyExpanded(null);
    }
  }, [totalHealthy]);

  return {
    showCritical: criticalCount > 0 && (criticalExpanded ?? true),
    showWarnings: warningCount > 0 && (warningsExpanded ?? true),
    showInfo: infoCount > 0 && (infoExpanded ?? true),
    showHealthy: totalHealthy > 0 && (healthyExpanded ?? true),
    onToggleCritical: () => setCriticalExpanded(current => !(current ?? true)),
    onToggleWarnings: () => setWarningsExpanded(current => !(current ?? true)),
    onToggleInfo: () => setInfoExpanded(current => !(current ?? true)),
    onToggleHealthy: () => setHealthyExpanded(current => !(current ?? true)),
  };
}
