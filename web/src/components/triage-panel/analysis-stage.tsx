import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import type { BackendAnalysisProgress } from './triage-domain';
import { InlineAnalysis } from './inline-analysis';
import { WelcomeBanner } from './welcome-banner';

type AnalysisStageProps = {
  isAnalyzing: boolean;
  analysisProgress: BackendAnalysisProgress | null;
  isFirstTime: boolean;
  showWelcome: boolean;
  onDismissWelcome: () => void;
  onOpenRulesetsFromWelcome: () => void;
  children: ReactNode;
};

/**
 * Rendert die obere Analysestufe des Anforderungsprüfungs-Views.
 *
 * UI-Belegung:
 * - Analyse-in-Progress-Animation (InlineAnalysis)
 * - Inhalt-Eingangsanimation wenn Analyse abgeschlossen
 * - optionaler Welcome-Banner mit Regelset-Direktlink
 */
export function AnalysisStage({
  isAnalyzing,
  analysisProgress,
  isFirstTime,
  showWelcome,
  onDismissWelcome,
  onOpenRulesetsFromWelcome,
  children,
}: AnalysisStageProps) {
  return (
    <>
      {/* UI: Zwischenstand-Animation waehrend Analyse */}
      <AnimatePresence mode="wait">
        {isAnalyzing && <InlineAnalysis progress={analysisProgress} />}
      </AnimatePresence>

      {!isAnalyzing && (
        <motion.div
          initial={isFirstTime ? { opacity: 0, y: 8 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="space-y-3"
        >
          <AnimatePresence>
            {showWelcome && (
              /* UI: Welcome-Box mit Schnellzugriff auf Regelwerke */
              <WelcomeBanner
                onDismiss={onDismissWelcome}
                onOpenRulesets={onOpenRulesetsFromWelcome}
              />
            )}
          </AnimatePresence>
          {children}
        </motion.div>
      )}
    </>
  );
}
