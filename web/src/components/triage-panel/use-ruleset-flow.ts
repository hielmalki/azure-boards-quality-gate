import { useEffect, useState } from 'react';
import { loadActiveRulesets } from '../rulesets-data';
import { areRulesetIdsEqual } from './triage-domain';

type UseRulesetFlowOptions = {
  initialActiveRulesets?: string[];
};

/**
 * Manages ruleset initialization for the triage panel.
 *
 * Responsibilities:
 * - load persisted active rulesets once on mount
 * - expose loading-ready state for downstream analysis hooks
 * - keep current active rulesets state centralized for the panel
 */
export function useRulesetFlow({ initialActiveRulesets = ['basic-quality'] }: UseRulesetFlowOptions = {}) {
  const [activeRulesets, setActiveRulesets] = useState<string[]>(initialActiveRulesets);
  const [rulesetsInitialized, setRulesetsInitialized] = useState(false);
  const [showRulesets, setShowRulesets] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function syncActiveRulesets() {
      try {
        const rulesetIds = await loadActiveRulesets();
        if (isMounted) {
          setActiveRulesets(current =>
            areRulesetIdsEqual(current, rulesetIds) ? current : rulesetIds
          );
        }
      } finally {
        if (isMounted) {
          setRulesetsInitialized(true);
        }
      }
    }

    void syncActiveRulesets();

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    activeRulesets,
    showRulesets,
    rulesetsInitialized,
    openRulesets: () => setShowRulesets(true),
    closeRulesets: () => setShowRulesets(false),
    saveRulesets: (nextRulesets: string[]) => {
      setActiveRulesets(nextRulesets);
    },
  };
}
