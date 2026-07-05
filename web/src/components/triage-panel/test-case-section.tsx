import { useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ClipboardList,
  Copy,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useTestCaseGeneration } from './use-test-case-generation';
import { TestCaseConfigForm } from './test-case-config-form';
import { TestCaseStepsForm } from './test-case-steps-form';
import { FixFlow } from './fix-flow';
import { mapFindingToIssue, type AnalysisFinding, type AnalysisResult, type TestCase } from './triage-domain';

type ConfigTab = 'newTestCases' | 'addSteps';

type TestCaseSectionProps = {
  issueKey: string | null | undefined;
  onTokenUsageChanged?: () => void;
  /** Kritisches Finding "acceptance_criteria_missing" aus der Analyse, falls AK fehlen. */
  acceptanceCriteriaFinding?: AnalysisFinding;
  /** Normalisierter Issue-Kontext (für die Wiederverwendung des FixFlow). */
  issueContext?: AnalysisResult['issue'];
  /** Löst eine erneute Analyse aus, nachdem AK ergänzt wurden (öffnet das Gate). */
  onAcceptanceCriteriaApplied?: () => void | Promise<void>;
};

function formatTestCasesAsText(testCases: TestCase[]): string {
  return testCases
    .map((testCase, index) => {
      const lines = [`${index + 1}. ${testCase.title} (Priorität ${testCase.priority})`];
      if (testCase.preconditions) {
        lines.push(`   Vorbedingung: ${testCase.preconditions}`);
      }
      testCase.steps.forEach((step, stepIndex) => {
        lines.push(`   ${stepIndex + 1}. ${step.action} → ${step.expected}`);
      });
      if (testCase.derivedFrom) {
        lines.push(`   Abgeleitet aus: ${testCase.derivedFrom}`);
      }
      return lines.join('\n');
    })
    .join('\n\n');
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Testfall-Abschnitt mit geführtem Flow (docs/testfall-generierung-flow.drawio):
 * Zustand 1 (AK fehlen -> Fix wiederverwenden), Zustand 3 / Weg A (Konfig-Formular),
 * dann editierbare Vorschau + Rückschreibwege (anlegen / kopieren / anhängen).
 * Generieren und Anlegen sind bewusst getrennt – die KI legt nie automatisch etwas an.
 */
export function TestCaseSection({
  issueKey,
  onTokenUsageChanged,
  acceptanceCriteriaFinding,
  issueContext,
  onAcceptanceCriteriaApplied,
}: TestCaseSectionProps) {
  const {
    state,
    testCases,
    error,
    createSummary,
    attachedCount,
    existingTestCases,
    hasExisting,
    defaultConfig,
    startFlow,
    submitConfig,
    cancel,
    updateTestCase,
    removeTestCase,
    createWorkItems,
    attachToStory,
  } = useTestCaseGeneration({
    issueKey,
    acceptanceCriteriaMissing: Boolean(acceptanceCriteriaFinding),
    onTokenUsageChanged,
  });
  const [copied, setCopied] = useState(false);
  const [acFixOpen, setAcFixOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ConfigTab>('newTestCases');

  const isBusy =
    state === 'checking' || state === 'generating' || state === 'creating' || state === 'attaching';
  const flowActive = state !== 'idle' && state !== 'ready';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatTestCasesAsText(testCases));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadTextFile(`testfaelle-${issueKey ?? 'story'}.txt`, formatTestCasesAsText(testCases));
  };

  const handleAcApplied = async () => {
    setAcFixOpen(false);
    await onAcceptanceCriteriaApplied?.();
    // Zurück zu idle: das aktualisierte Finding (jetzt vorhanden) öffnet beim
    // nächsten Klick das Konfig-Formular statt des AK-Gates.
    cancel();
  };

  const handleStartFlow = () => {
    setActiveTab('newTestCases');
    void startFlow();
  };

  const handleCancelConfig = () => {
    setActiveTab('newTestCases');
    cancel();
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
        <ClipboardList size={13} className="text-gray-500 shrink-0" />
        <span className="text-xs font-medium text-gray-700 tracking-wide uppercase">Testfälle</span>
        {testCases.length > 0 && (
          <span className="text-xs text-gray-400">{testCases.length} generiert</span>
        )}
        <button
          onClick={handleStartFlow}
          disabled={isBusy || flowActive || !issueKey}
          className="ml-auto flex items-center gap-1.5 px-2.5 py-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors disabled:opacity-60"
        >
          {state === 'generating' || state === 'checking' ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Sparkles size={11} />
          )}
          {testCases.length > 0 ? 'Neu generieren' : 'Testfälle generieren'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Zustand 1: Akzeptanzkriterien fehlen -> Fix (Basic-Regelset) wiederverwenden */}
      {state === 'acMissing' && (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2.5">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>
              Ohne Akzeptanzkriterien lassen sich keine fundierten Testfälle ableiten. Ergänze zuerst
              die Akzeptanzkriterien der User Story – am einfachsten mit dem KI-Fix des Basic-Regelsets.
            </span>
          </div>

          {!acFixOpen && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAcFixOpen(true)}
                className="flex items-center gap-1.5 h-[34px] px-3 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-[8px] transition-colors"
              >
                <Sparkles size={12} />
                Mit Basic-Regelset beheben (Fix)
              </button>
              <button
                onClick={() => void handleAcApplied()}
                className="flex items-center gap-1.5 h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors"
                title="Erneut prüfen, falls du die Akzeptanzkriterien bereits ergänzt hast"
              >
                <RefreshCw size={12} />
                Ich habe AK ergänzt – erneut prüfen
              </button>
              <button
                onClick={cancel}
                className="h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors"
              >
                Abbrechen
              </button>
            </div>
          )}

          {acFixOpen && acceptanceCriteriaFinding && (
            <FixFlow
              issue={mapFindingToIssue(acceptanceCriteriaFinding, issueContext)}
              issueKey={issueKey}
              issueContext={issueContext}
              onClose={() => setAcFixOpen(false)}
              onApplied={handleAcApplied}
              onTokenUsageChanged={onTokenUsageChanged}
            />
          )}
        </div>
      )}

      {/* Zustand 3 / Zustand 2: Konfig-Formular (bleibt während 'generating' montiert,
          damit die Eingaben bei einem Fehler nicht verloren gehen). Bei bereits
          vorhandenen Testfällen (Zustand 2) stehen zwei Wege als Tabs zur Wahl. */}
      {(state === 'configuring' || state === 'generating') && (
        <div>
          {hasExisting && (
            <div className="flex gap-1 px-4 pt-3">
              <button
                onClick={() => setActiveTab('newTestCases')}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'newTestCases'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Neue Testfälle
              </button>
              <button
                onClick={() => setActiveTab('addSteps')}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                  activeTab === 'addSteps' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Steps ergänzen
              </button>
            </div>
          )}

          {(!hasExisting || activeTab === 'newTestCases') && (
            <TestCaseConfigForm
              hasExisting={hasExisting}
              existingTestCases={existingTestCases}
              defaultConfig={defaultConfig}
              isBusy={isBusy}
              onGenerate={(config, instruction) => void submitConfig(config, instruction)}
              onCancel={handleCancelConfig}
            />
          )}

          {hasExisting && activeTab === 'addSteps' && (
            <TestCaseStepsForm
              issueKey={issueKey}
              existingTestCases={existingTestCases}
              onCancel={handleCancelConfig}
            />
          )}
        </div>
      )}

      {testCases.length > 0 && state !== 'configuring' && state !== 'generating' && (
        <div className="divide-y divide-gray-100">
          {testCases.map((testCase, index) => (
            <div key={`${testCase.title}-${index}`} className="px-4 py-3 space-y-2">
              <div className="flex items-start gap-2">
                <input
                  value={testCase.title}
                  onChange={event => updateTestCase(index, { title: event.target.value })}
                  className="flex-1 px-2 py-1.5 border border-gray-200 rounded-[6px] text-sm font-medium text-gray-800 outline-none focus:border-blue-400 transition-colors"
                />
                <button
                  onClick={() => removeTestCase(index)}
                  className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-600 transition-colors shrink-0"
                  title="Testfall entfernen"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <textarea
                value={testCase.preconditions}
                onChange={event => updateTestCase(index, { preconditions: event.target.value })}
                placeholder="Vorbedingung"
                rows={1}
                className="w-full px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs text-gray-600 outline-none resize-none focus:border-blue-400 transition-colors"
              />

              <ul className="space-y-1">
                {testCase.steps.map((step, stepIndex) => (
                  <li key={stepIndex} className="text-xs text-gray-600 px-2 py-1 bg-gray-50 rounded-[4px]">
                    {stepIndex + 1}. {step.action} → <span className="text-gray-500">{step.expected}</span>
                  </li>
                ))}
              </ul>

              {testCase.derivedFrom && (
                <div className="text-[11px] text-gray-400">Abgeleitet aus: {testCase.derivedFrom}</div>
              )}
            </div>
          ))}

          <div className="px-4 py-3 flex flex-wrap gap-2">
            <button
              onClick={() => void createWorkItems(testCases)}
              disabled={isBusy}
              className="flex items-center gap-1.5 h-[34px] px-3 bg-gray-900 text-white text-xs rounded-[8px] hover:bg-gray-800 transition-colors disabled:opacity-60"
            >
              {state === 'creating' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Als Test Case anlegen
            </button>
            <button
              onClick={() => void handleCopy()}
              className="flex items-center gap-1.5 h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors"
            >
              {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              {copied ? 'Kopiert' : 'Kopieren'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors"
            >
              <Download size={12} />
              Herunterladen
            </button>
            <button
              onClick={() => void attachToStory(testCases)}
              disabled={isBusy}
              className="flex items-center gap-1.5 h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              {state === 'attaching' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              An Story anhängen
            </button>
          </div>

          {createSummary && (
            <div className="px-4 pb-3 text-xs text-emerald-700">
              {createSummary.succeeded} von {createSummary.requested} Test Case(s) angelegt
              {createSummary.failed > 0 ? `, ${createSummary.failed} fehlgeschlagen` : ''}.
            </div>
          )}

          {attachedCount != null && (
            <div className="px-4 pb-3 text-xs text-emerald-700">
              {attachedCount} Testfall/-fälle an die Story angehängt.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
