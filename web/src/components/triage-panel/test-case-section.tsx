import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ClipboardX,
  Copy,
  Download,
  FileText,
  GitBranch,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useTestCaseGeneration } from './use-test-case-generation';
import { TestCaseConfigForm } from './test-case-config-form';
import { TestCaseStepsForm } from './test-case-steps-form';
import { EditableText } from './editable-text';
import { FixFlow } from './fix-flow';
import {
  mapFindingToIssue,
  TEST_CASE_TYPE_BADGE,
  type AnalysisFinding,
  type AnalysisResult,
  type TestCase,
  type TestCaseStep,
} from './triage-domain';

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

// ING Corporate Orange – primäre Aktionen im Testfall-Bereich.
const PRIMARY_BUTTON =
  'flex items-center gap-1.5 h-[34px] px-3 text-xs rounded-[8px] transition-colors bg-[#FF6200] hover:bg-[#E55800] text-white disabled:opacity-40 disabled:cursor-not-allowed';

// Kompaktere Variante für die Header-Aktion (Generieren/Neu generieren) – dieselbe
// Akzentfarbe, aber kleinere Geometrie als die primären Formular-CTAs unten.
const HEADER_BUTTON =
  'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-[6px] transition-colors bg-[#FF6200] hover:bg-[#E55800] text-white disabled:opacity-40 disabled:cursor-not-allowed';

function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="text-[10px] font-semibold text-gray-500 tracking-wide uppercase mb-1">{children}</div>;
}

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

// Zweite Verteidigungslinie gegen sinnlose Schreibvorgänge (der Hook blockt schon
// eine leere Auswahl): ein Testfall ohne Titel oder ohne einen einzigen Step mit
// Inhalt (z. B. weil der Nutzer alle Steps gelöscht hat) wird beim Anlegen/Anhängen
// übersprungen statt als leerer Test Case in Azure DevOps zu landen.
function isSaveableTestCase(testCase: TestCase): boolean {
  return (
    testCase.title.trim().length > 0 &&
    testCase.steps.some(step => step.action.trim().length > 0 || step.expected.trim().length > 0)
  );
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

type TestCaseResultCardProps = {
  index: number;
  testCase: TestCase;
  selected: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
  onUpdateTitle: (value: string) => void;
  onUpdatePreconditions: (value: string) => void;
  onUpdateStep: (stepIndex: number, patch: Partial<TestCaseStep>) => void;
  onRemoveStep: (stepIndex: number) => void;
  onAddStep: () => void;
};

/**
 * Einzelne Testfall-Karte in der Ergebnisliste, ein-/ausklappbar (Default: offen).
 * Kollaps-Muster analog zu IssueRow (issue-row.tsx): AnimatePresence + motion.div
 * für Höhe/Opacity, Chevron zeigt den Zustand. Klicks auf Checkbox, Titel-Feld und
 * Löschen-Button stoppen die Propagation, damit sie nicht versehentlich die Karte
 * ein-/ausklappen.
 */
function TestCaseResultCard({
  index,
  testCase,
  selected,
  onToggleSelect,
  onRemove,
  onUpdateTitle,
  onUpdatePreconditions,
  onUpdateStep,
  onRemoveStep,
  onAddStep,
}: TestCaseResultCardProps) {
  const [expanded, setExpanded] = useState(true);
  const badge = testCase.type ? TEST_CASE_TYPE_BADGE[testCase.type] : null;

  return (
    <div className="border border-gray-200 rounded-[10px] overflow-hidden bg-white transition-colors hover:border-gray-300">
      <div
        className={`flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 cursor-pointer ${expanded ? 'border-b border-gray-100' : ''}`}
        onClick={() => setExpanded(current => !current)}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={event => event.stopPropagation()}
          className="h-3.5 w-3.5 rounded border-gray-300 accent-[#FF6200] cursor-pointer shrink-0"
          title="Für Übernahme auswählen"
        />
        <span className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1 rounded-[6px] bg-white border border-gray-200 text-[11px] font-semibold text-gray-600 tabular-nums shrink-0">
          {index + 1}
        </span>
        {badge && (
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium shrink-0 ${badge.badgeClass}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
            {badge.label}
          </span>
        )}
        <div className="flex-1 min-w-0" onClick={event => event.stopPropagation()}>
          <EditableText value={testCase.title} onChange={onUpdateTitle} className="text-sm font-medium text-gray-800" />
        </div>
        <button
          onClick={event => {
            event.stopPropagation();
            onRemove();
          }}
          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors shrink-0"
          title="Testfall entfernen"
        >
          <Trash2 size={13} />
        </button>
        {expanded ? (
          <ChevronDown size={16} className="text-gray-400 shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-gray-400 shrink-0" />
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
            <div className="px-3.5 py-3.5 space-y-3">
              <div>
                <FieldLabel>Vorbedingung</FieldLabel>
                <EditableText
                  value={testCase.preconditions}
                  onChange={onUpdatePreconditions}
                  className="text-gray-600"
                  placeholder="Vorbedingung"
                />
              </div>

              <div>
                <FieldLabel>
                  Testschritte{' '}
                  <span className="text-gray-400 normal-case font-normal">({testCase.steps.length})</span>
                </FieldLabel>
                {testCase.steps.length === 0 && (
                  <p className="text-xs text-gray-400 mb-2">Keine Schritte mehr vorhanden.</p>
                )}
                <ol className="space-y-2">
                  {testCase.steps.map((step, stepIndex) => (
                    <li key={stepIndex} className="flex items-start gap-2">
                      <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 tabular-nums">
                        {stepIndex + 1}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <EditableText
                          value={step.action}
                          onChange={value => onUpdateStep(stepIndex, { action: value })}
                          className="text-gray-800"
                          placeholder="Aktion beschreiben…"
                        />
                        <div className="border-l-2 border-gray-200 pl-2">
                          <div className="text-[10px] font-semibold text-gray-400 tracking-wide uppercase mb-0.5">
                            Erwartetes Ergebnis
                          </div>
                          <EditableText
                            value={step.expected}
                            onChange={value => onUpdateStep(stepIndex, { expected: value })}
                            className="text-gray-600"
                            placeholder="Erwartetes Ergebnis beschreiben…"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => onRemoveStep(stepIndex)}
                        className="p-1 h-fit text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors shrink-0"
                        title="Schritt entfernen"
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ol>
                <button
                  onClick={onAddStep}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 border border-dashed border-gray-300 rounded-[8px] text-xs text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Plus size={12} />
                  Schritt hinzufügen
                </button>
              </div>

              {testCase.derivedFrom && (
                <div className="flex items-start gap-1.5 pt-2 border-t border-gray-100">
                  <GitBranch size={11} className="text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-gray-400">Abgeleitet aus: {testCase.derivedFrom}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
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
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const previousStateRef = useRef(state);

  const isBusy =
    state === 'checking' || state === 'generating' || state === 'creating' || state === 'attaching';
  const flowActive = state !== 'idle' && state !== 'ready';

  // Nach einer frischen Generierung sind standardmäßig alle Testfälle ausgewählt.
  // Reine Bearbeitungen (Titel/Steps) lösen keine Neuauswahl aus, da testCases dann
  // zwar eine neue Array-Referenz hat, der Zustand aber weiterhin 'ready' bleibt.
  useEffect(() => {
    if (state === 'ready' && previousStateRef.current === 'generating') {
      setSelectedIndices(new Set(testCases.map((_, index) => index)));
    }
    previousStateRef.current = state;
  }, [state, testCases]);

  const selectedTestCases = testCases.filter((_, index) => selectedIndices.has(index));
  const saveableSelected = selectedTestCases.filter(isSaveableTestCase);
  const skippedCount = selectedTestCases.length - saveableSelected.length;
  const allSelected = testCases.length > 0 && selectedIndices.size === testCases.length;

  const toggleSelected = (index: number) => {
    setSelectedIndices(current => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIndices(allSelected ? new Set() : new Set(testCases.map((_, index) => index)));
  };

  const handleRemove = (index: number) => {
    removeTestCase(index);
    setSelectedIndices(current => {
      const next = new Set<number>();
      current.forEach(selectedIndex => {
        if (selectedIndex < index) next.add(selectedIndex);
        else if (selectedIndex > index) next.add(selectedIndex - 1);
      });
      return next;
    });
  };

  const updateStep = (caseIndex: number, stepIndex: number, patch: Partial<TestCaseStep>) => {
    const steps = testCases[caseIndex].steps.map((step, i) => (i === stepIndex ? { ...step, ...patch } : step));
    updateTestCase(caseIndex, { steps });
  };

  const removeStep = (caseIndex: number, stepIndex: number) => {
    const steps = testCases[caseIndex].steps.filter((_, i) => i !== stepIndex);
    updateTestCase(caseIndex, { steps });
  };

  const addStep = (caseIndex: number) => {
    const steps = [...testCases[caseIndex].steps, { action: '', expected: '' }];
    updateTestCase(caseIndex, { steps });
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatTestCasesAsText(selectedTestCases));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    downloadTextFile(`testfaelle-${issueKey ?? 'story'}.txt`, formatTestCasesAsText(selectedTestCases));
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
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100">
        <ClipboardList size={13} className="text-gray-500 shrink-0" />
        <span className="text-xs font-medium text-gray-700 tracking-wide uppercase">Testfälle</span>
        {testCases.length > 0 && (
          <span className="text-xs text-gray-400">{testCases.length} generiert</span>
        )}
        <button
          onClick={handleStartFlow}
          disabled={isBusy || flowActive || !issueKey}
          className={`ml-auto ${HEADER_BUTTON}`}
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
            <div className="px-4 pt-3">
              <div className="inline-flex items-center gap-1 p-0.5 bg-gray-100 rounded-[8px]">
                <button
                  onClick={() => setActiveTab('newTestCases')}
                  className={`px-2.5 py-1 text-xs rounded-[6px] transition-colors ${
                    activeTab === 'newTestCases'
                      ? 'bg-white text-gray-900 shadow-[0_1px_2px_rgba(16,24,40,0.06)]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Neue Testfälle
                </button>
                <button
                  onClick={() => setActiveTab('addSteps')}
                  className={`px-2.5 py-1 text-xs rounded-[6px] transition-colors ${
                    activeTab === 'addSteps'
                      ? 'bg-white text-gray-900 shadow-[0_1px_2px_rgba(16,24,40,0.06)]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Steps ergänzen
                </button>
              </div>
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

      {state === 'ready' && testCases.length === 0 && (
        <div className="p-6 flex flex-col items-center text-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <ClipboardX size={18} className="text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Keine Testfälle mehr</p>
            <p className="text-xs text-gray-500 mt-1 max-w-[320px]">
              Es sind aktuell keine generierten Testfälle vorhanden. Generiere neue Fälle, um
              fortzufahren.
            </p>
          </div>
          <button onClick={handleStartFlow} disabled={!issueKey} className={PRIMARY_BUTTON}>
            <Sparkles size={12} />
            Neu generieren
          </button>
        </div>
      )}

      {testCases.length > 0 && state !== 'configuring' && state !== 'generating' && (
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="h-3.5 w-3.5 rounded border-gray-300 accent-[#FF6200] cursor-pointer"
              />
              <span className="text-xs text-gray-600">
                <span className="font-medium text-gray-900 tabular-nums">{selectedIndices.size}</span>{' '}
                von <span className="tabular-nums">{testCases.length}</span> ausgewählt
              </span>
            </label>
          </div>

          {testCases.map((testCase, index) => (
            <TestCaseResultCard
              key={index}
              index={index}
              testCase={testCase}
              selected={selectedIndices.has(index)}
              onToggleSelect={() => toggleSelected(index)}
              onRemove={() => handleRemove(index)}
              onUpdateTitle={value => updateTestCase(index, { title: value })}
              onUpdatePreconditions={value => updateTestCase(index, { preconditions: value })}
              onUpdateStep={(stepIndex, patch) => updateStep(index, stepIndex, patch)}
              onRemoveStep={stepIndex => removeStep(index, stepIndex)}
              onAddStep={() => addStep(index)}
            />
          ))}

          {skippedCount > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-[8px] p-2.5">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span>
                {skippedCount} ausgewählte{skippedCount === 1 ? 'r Testfall wird' : ' Testfälle werden'} ohne
                Titel oder Schritte beim Anlegen/Anhängen übersprungen.
              </span>
            </div>
          )}

          <div className="pt-1 flex flex-wrap gap-2">
            <button
              onClick={() => void createWorkItems(saveableSelected)}
              disabled={isBusy || saveableSelected.length === 0}
              className={PRIMARY_BUTTON}
            >
              {state === 'creating' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Als Test Case anlegen{saveableSelected.length > 0 ? ` (${saveableSelected.length})` : ''}
            </button>
            <button
              onClick={() => void handleCopy()}
              disabled={selectedTestCases.length === 0}
              className="flex items-center gap-1.5 h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
              {copied ? 'Kopiert' : 'Kopieren'}
            </button>
            <button
              onClick={handleDownload}
              disabled={selectedTestCases.length === 0}
              className="flex items-center gap-1.5 h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={12} />
              Herunterladen
            </button>
            <button
              onClick={() => void attachToStory(saveableSelected)}
              disabled={isBusy || saveableSelected.length === 0}
              className="flex items-center gap-1.5 h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {state === 'attaching' ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              An Story anhängen
            </button>
          </div>

          {createSummary && (
            <div className="text-xs text-emerald-700">
              {createSummary.succeeded} von {createSummary.requested} Test Case(s) angelegt
              {createSummary.failed > 0 ? `, ${createSummary.failed} fehlgeschlagen` : ''}.
            </div>
          )}

          {attachedCount != null && (
            <div className="text-xs text-emerald-700">
              {attachedCount} Testfall/-fälle an die Story angehängt.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
