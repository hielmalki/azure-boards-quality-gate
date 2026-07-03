import { RulesetManager } from './RulesetManager';
import { QualityScore } from './QualityScore';
import { useTokenUsage } from '../hooks/useTokenUsage';
import {
  BASE_SCORE,
  mapAnalysisToIssueTriage,
} from './triage-panel/triage-domain';
import { useAnalysisFlow } from './triage-panel/use-analysis-flow';
import { FixFlow } from './triage-panel/fix-flow';
import { TriageSections } from './triage-panel/triage-sections';
import { IssueRow } from './triage-panel/issue-row';
import { BatchFixFlow } from './triage-panel/batch-fix-flow';
import { AnalysisStage } from './triage-panel/analysis-stage';
import { useRulesetFlow } from './triage-panel/use-ruleset-flow';
import { useSectionVisibility } from './triage-panel/use-section-visibility';
import { useFixApplyFlow } from './triage-panel/use-fix-apply-flow';
import { useAnalysisResultSynchronization } from './triage-panel/use-analysis-result-synchronization';
import { HeaderActions } from './triage-panel/header-actions';
import { DuplicateSection } from './triage-panel/duplicate-section';
import { useDuplicateCheck } from '../hooks/useDuplicateCheck';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, AlertTriangle, Sparkles, KeyRound } from 'lucide-react';

const TRIAGE_BUNDLE_MARKER = 'triage-bundle-2026-04-09-racefix-v2';

interface TriagePanelProps {
  isFirstTime?: boolean;
  onFirstTimeComplete?: () => void;
  onOpenApiKeySettings?: () => void;
  apiKeyConfigured?: boolean;
}

export function TriagePanel({ isFirstTime = false, onFirstTimeComplete, onOpenApiKeySettings, apiKeyConfigured = true }: TriagePanelProps) {
  // UI State: steuert, ob der "Alle beheben"-Flow sichtbar ist.
  const [showBatchFix, setShowBatchFix] = useState(false);
  // UI State: aktueller Quality-Score inkl. "vorher"-Wert für visuelle Score-Übergänge.
  const [score, setScore] = useState(BASE_SCORE);
  const [previousScore, setPreviousScore] = useState<number | null>(null);
  // UI State: lokale Optimistic-States nach Apply, bis die Reanalyse zurückkommt.
  const [fixedCount, setFixedCount] = useState(0);
  const [resolvedIssues, setResolvedIssues] = useState<Set<string>>(new Set());
  const [resolvedFulfilledFindingIds, setResolvedFulfilledFindingIds] = useState<Set<string>>(new Set());
  // UI State: Onboarding-/Welcome-Hinweis für Erstnutzer.
  const [showWelcome, setShowWelcome] = useState(isFirstTime);
  const {
    activeRulesets,
    showRulesets,
    rulesetsInitialized,
    openRulesets,
    closeRulesets,
    saveRulesets,
  } = useRulesetFlow();
  const handleAcceptedAnalysis = useCallback(() => {
    setResolvedIssues(new Set());
  }, []);
  const {
    analysisResult,
    analysisError,
    analysisProgress,
    isAnalyzing,
    postApplyReanalysisInProgress,
    postApplyReanalysisError,
    runPostApplyReanalysis,
  } = useAnalysisFlow({
    activeRulesets,
    rulesetsInitialized,
    initialIsAnalyzing: isFirstTime,
    onAcceptedAnalysis: handleAcceptedAnalysis,
  });
  const {
    totalTokens,
    inputTokens,
    outputTokens,
    isLoading: isTokenUsageLoading,
    refresh: refreshTokenUsage,
  } = useTokenUsage();

  const issueTriage = useMemo(
    () => mapAnalysisToIssueTriage(analysisResult) ?? {
      critical: [],
      warnings: [],
      info: [],
      healthy: [],
    },
    [analysisResult]
  );
  const currentIssueKey = analysisResult?.issue?.key ?? null;

  const activeCount = activeRulesets.length;
  const duplicateCheckEnabled = activeRulesets.includes('duplicate-check');
  const {
    candidates: duplicateCandidates,
    keywords: duplicateKeywords,
    isLoading: isDuplicateCheckLoading,
    error: duplicateCheckError,
    skipped: duplicateCheckSkipped,
    hasCompleted: duplicateCheckCompleted,
  } = useDuplicateCheck({
    issueKey: analysisResult?.issue?.key,
    summary: analysisResult?.issue?.summary,
    // Projektschlüssel aus dem Standard-PROJ-123-Issue-Key-Format ableiten; null
    // (deaktiviert die Duplikatprüfung) bei unerwarteten Formaten.
    projectKey: analysisResult?.issue?.key?.match(/^([A-Za-z][A-Za-z0-9]+)-\d+$/)?.[1] ?? null,
    enabled: duplicateCheckEnabled && !isAnalyzing && !!analysisResult,
  });
  const warningCount = issueTriage.warnings.length;
  const infoCount = issueTriage.info.length;

  // Nicht-blockierender Fehler-Banner-Inhalt, einmal pro Fehleränderung berechnet
  // (zuvor bei jedem Render inline per IIFE neu berechnet).
  const analysisErrorBanner = useMemo(() => {
    if (!analysisError) {
      return null;
    }
    const msg = analysisError.toLowerCase();
    const isAuthError =
      msg.includes('401') ||
      msg.includes('unauthorized') ||
      msg.includes('invalid api key') ||
      msg.includes('revoked');
    const isTimeoutError = msg.includes('timeout') || msg.includes('timed out');
    const label = isAuthError
      ? 'API-Schlüssel ungültig oder abgelaufen.'
      : isTimeoutError
        ? 'OpenAI antwortet nicht (Timeout). Bitte erneut versuchen.'
        : 'KI-Analyse konnte nicht abgeschlossen werden.';
    return { isAuthError, label };
  }, [analysisError]);
  const fixableIssues = useMemo(
    () => [...issueTriage.critical, ...issueTriage.warnings].filter(issue => issue.hasAIFix && !resolvedIssues.has(issue.id)),
    [issueTriage, resolvedIssues]
  );

  const unresolvedCritical = issueTriage.critical.filter(issue => !resolvedIssues.has(issue.id));
  const unresolvedWarnings = issueTriage.warnings.filter(issue => !resolvedIssues.has(issue.id));
  const criticalCount = unresolvedCritical.length;
  const allCriticalResolved = unresolvedCritical.length === 0 && fixedCount > 0;

  const resolvedAsHealthy = [...issueTriage.critical, ...issueTriage.warnings].filter(issue => resolvedIssues.has(issue.id));
  const totalHealthy = issueTriage.healthy.length + resolvedAsHealthy.length;
  const {
    showCritical,
    showWarnings,
    showInfo,
    showHealthy,
    onToggleCritical,
    onToggleWarnings,
    onToggleInfo,
    onToggleHealthy,
  } = useSectionVisibility({
    criticalCount,
    warningCount,
    infoCount,
    totalHealthy,
  });
  const { handleSingleFixApplied, handleBatchApplied } = useFixApplyFlow({
    score,
    currentIssueKey,
    fixableIssues,
    runPostApplyReanalysis,
    setPreviousScore,
    setScore,
    setFixedCount,
    setResolvedIssues,
    setResolvedFulfilledFindingIds,
  });
  useAnalysisResultSynchronization({
    analysisResult,
    setScore,
    setPreviousScore,
    setResolvedFulfilledFindingIds,
  });

  const handleDismissWelcome = () => {
    setShowWelcome(false);
    onFirstTimeComplete?.();
  };

  useEffect(() => {
    console.log('[Requirement Check] Bundle marker active:', {
      marker: TRIAGE_BUNDLE_MARKER,
      component: 'TriagePanel',
    });
  }, []);

  return (
    <div
      className={`mx-auto px-4 py-5 space-y-3 transition-all duration-150 ${
        showRulesets ? 'max-w-5xl min-h-[780px]' : 'max-w-2xl'
      }`}
    >
      <div>
        {/* UI: Issue-Key oberhalb des Requirement-Check-Headers */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs text-gray-400 tracking-wide">{analysisResult?.issue?.key ?? 'STORY-123'}</span>
        </div>

        {/* UI: Header-Zeile mit Titel + Header-Aktionen */}
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-gray-900">Anforderungsprüfung</h1>
          <HeaderActions
            totalTokens={totalTokens}
            inputTokens={inputTokens}
            outputTokens={outputTokens}
            isTokenUsageLoading={isTokenUsageLoading}
            activeCount={activeCount}
            onOpenRulesets={openRulesets}
            onOpenApiKeySettings={onOpenApiKeySettings ?? (() => {})}
          />
        </div>

        {/* UI: Score-Balken + Score-Label; während Analyse durch Inline-Animation ersetzt */}
        {!isAnalyzing && (
          <QualityScore score={score} previousScore={previousScore} resolvedIds={resolvedIssues} />
        )}
      </div>

      <AnalysisStage
        isAnalyzing={isAnalyzing}
        analysisProgress={analysisProgress}
        isFirstTime={isFirstTime}
        showWelcome={showWelcome}
        onDismissWelcome={handleDismissWelcome}
        onOpenRulesetsFromWelcome={() => {
          openRulesets();
          handleDismissWelcome();
        }}
      >

          {/* UI: Kein API Key konfiguriert */}
          {!apiKeyConfigured && (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
              <div className="flex items-center gap-2">
                <KeyRound size={14} className="shrink-0" />
                <span>KI-Prüfungen erfordern einen OpenAI API-Schlüssel.</span>
              </div>
              <button
                onClick={onOpenApiKeySettings}
                className="shrink-0 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-300 rounded hover:bg-blue-100 transition-colors"
              >
                Einrichten
              </button>
            </div>
          )}

          {/* UI: Analyse-Fehlerhinweis (nicht blockierend) */}
          {analysisErrorBanner && (
            <div className="flex items-center justify-between gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <div className="flex items-center gap-2">
                <AlertTriangle size={14} className="shrink-0" />
                <span>{analysisErrorBanner.label}</span>
              </div>
              {analysisErrorBanner.isAuthError ? (
                <button
                  onClick={onOpenApiKeySettings}
                  className="shrink-0 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-300 rounded hover:bg-amber-100 transition-colors"
                >
                  Schlüssel prüfen
                </button>
              ) : (
                <button
                  onClick={() => window.location.reload()}
                  className="shrink-0 px-2.5 py-1 text-xs font-medium text-amber-800 border border-amber-300 rounded hover:bg-amber-100 transition-colors"
                >
                  Erneut versuchen
                </button>
              )}
            </div>
          )}

          {/* UI: Hinweis nach erfolgreichem Jira-Apply, falls Reanalyse fehlschlaegt */}
          {postApplyReanalysisError && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <AlertTriangle size={15} />
              <div className="flex-1">
                <span>
                  Jira-Änderung wurde übernommen, aber die neue Analyse konnte nicht geladen werden.
                </span>
              </div>
              <button
                onClick={() => {
                  void runPostApplyReanalysis();
                }}
                disabled={postApplyReanalysisInProgress}
                className="px-2.5 py-1 text-xs text-amber-800 border border-amber-300 rounded hover:bg-amber-100 transition-colors disabled:opacity-60"
              >
                {postApplyReanalysisInProgress ? 'Wird geprüft…' : 'Analyse neu laden'}
              </button>
            </div>
          )}

          {/* UI: Kompakte Summary-Zeile (Kritisch/Hinweise/Nicht pruefbar/Erfuellt + "Alle beheben") */}
          <div className="flex items-center gap-3 text-xs text-gray-500 py-1.5">
            <span className="flex items-center gap-1">
              <AlertCircle size={12} className={allCriticalResolved ? 'text-emerald-500' : 'text-red-500'} />
              {allCriticalResolved ? (
                <span className="text-emerald-600">Alle behoben</span>
              ) : (
                `${unresolvedCritical.length} kritisch`
              )}
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle size={12} className="text-amber-500" />
              {unresolvedWarnings.length} Hinweise
            </span>
            <span className="flex items-center gap-1">
              <AlertTriangle size={12} className="text-gray-400" />
              {issueTriage.info.length} nicht testbar
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 size={12} className="text-emerald-500" />
              {totalHealthy} bestanden
            </span>
            {fixableIssues.length > 0 && (
              <button
                onClick={() => setShowBatchFix(true)}
                className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors"
              >
                <Sparkles size={11} />
                Alle beheben ({fixableIssues.length})
              </button>
            )}
          </div>

          {/* UI: Batch-Fix Panel ("Alle beheben"), wenn aktiv */}
          <AnimatePresence>
            {showBatchFix && (
              <BatchFixFlow
                issues={fixableIssues}
                issueKey={analysisResult?.issue?.key ?? null}
                activeRulesets={activeRulesets}
                onClose={() => setShowBatchFix(false)}
                onAllApplied={handleBatchApplied}
                onTokenUsageChanged={refreshTokenUsage}
              />
            )}
          </AnimatePresence>

          {/* UI: Positive Bestaetigung, wenn alle kritischen Findings behoben sind */}
          {allCriticalResolved && (
            <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
              <CheckCircle2 size={15} />
              <span>Alle kritischen Probleme behoben</span>
            </div>
          )}

          {/* UI: Hauptbereiche der Findings (Kritisch/Hinweise/Nicht pruefbar/Erfuellt) */}
          <TriageSections
            criticalCount={criticalCount}
            warningCount={warningCount}
            infoCount={infoCount}
            totalHealthy={totalHealthy}
            showCritical={showCritical}
            showWarnings={showWarnings}
            showInfo={showInfo}
            showHealthy={showHealthy}
            unresolvedCritical={unresolvedCritical}
            unresolvedWarnings={unresolvedWarnings}
            infoIssues={issueTriage.info}
            resolvedAsHealthy={resolvedAsHealthy}
            healthyIssues={issueTriage.healthy}
            resolvedFulfilledFindingIds={resolvedFulfilledFindingIds}
            onToggleCritical={onToggleCritical}
            onToggleWarnings={onToggleWarnings}
            onToggleInfo={onToggleInfo}
            onToggleHealthy={onToggleHealthy}
            renderCriticalIssue={(issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                issueKey={analysisResult?.issue?.key}
                issueContext={analysisResult?.issue}
                severity="critical"
                isResolved={resolvedIssues.has(issue.id)}
                onFixApplied={() => handleSingleFixApplied(issue)}
                renderFixFlow={({ issue, issueKey, issueContext, onClose, onApplied }) => (
                  <FixFlow
                    issue={issue}
                    issueKey={issueKey}
                    issueContext={issueContext}
                    onClose={onClose}
                    onApplied={onApplied}
                    onTokenUsageChanged={refreshTokenUsage}
                  />
                )}
              />
            )}
            renderWarningIssue={(issue) => (
              <IssueRow
                key={issue.id}
                issue={issue}
                issueKey={analysisResult?.issue?.key}
                issueContext={analysisResult?.issue}
                severity="warning"
                isResolved={resolvedIssues.has(issue.id)}
                onFixApplied={() => handleSingleFixApplied(issue)}
                renderFixFlow={({ issue, issueKey, issueContext, onClose, onApplied }) => (
                  <FixFlow
                    issue={issue}
                    issueKey={issueKey}
                    issueContext={issueContext}
                    onClose={onClose}
                    onApplied={onApplied}
                    onTokenUsageChanged={refreshTokenUsage}
                  />
                )}
              />
            )}
          />

          {/* UI: Duplikatprüfung – angezeigt wenn das Duplikatprüfungs-Regelset aktiv ist */}
          {duplicateCheckEnabled && (
            <DuplicateSection
              candidates={duplicateCandidates}
              keywords={duplicateKeywords}
              isLoading={isDuplicateCheckLoading}
              error={duplicateCheckError}
              skipped={duplicateCheckSkipped}
              hasCompleted={duplicateCheckCompleted}
            />
          )}
      </AnalysisStage>

      {/* UI: Regelwerke-Modal ("Regelwerke verwalten"), als Overlay */}
      <AnimatePresence>
        {showRulesets && (
          <RulesetManager
            onClose={closeRulesets}
            onRulesetsSaved={saveRulesets}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
