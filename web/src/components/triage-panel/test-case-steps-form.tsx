import { useId, useState } from 'react';
import { AlertCircle, Check, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useTestCaseSteps } from './use-test-case-steps';
import type { ExistingTestCase } from './triage-domain';

type TestCaseStepsFormProps = {
  issueKey: string | null | undefined;
  existingTestCases: ExistingTestCase[];
  onCancel: () => void;
};

/**
 * Weg B (Zustand 2): bestehende Testfälle per Checkbox auswählen, optional
 * eine Anmerkung angeben, zusätzliche Schritte generieren lassen (editierbare
 * Vorschau je Testfall) und erst dann zurückschreiben ("Änderungen übernehmen").
 */
export function TestCaseStepsForm({ issueKey, existingTestCases, onCancel }: TestCaseStepsFormProps) {
  const { state, previews, error, generate, updateNewStep, removeNewStep, applyAll, reset } =
    useTestCaseSteps({ issueKey });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [instruction, setInstruction] = useState('');
  const fieldId = useId();

  const isBusy = state === 'generating' || state === 'applying';
  const selected = existingTestCases.filter(testCase => selectedIds.has(testCase.id));
  const canGenerate = selected.length > 0 && !isBusy;
  const hasUnapplied = previews.some(preview => !preview.applied && preview.newSteps.length > 0);

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleBackToSelection = () => {
    reset();
  };

  return (
    <div className="px-4 py-3 space-y-3">
      {state === 'idle' && (
        <>
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-gray-700 mb-1">
              Bestehende Testfälle auswählen
            </legend>
            {existingTestCases.map(testCase => (
              <label
                key={testCase.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] border border-gray-100 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(testCase.id)}
                  onChange={event => toggleSelected(testCase.id, event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-blue-600"
                />
                <span className="text-sm text-gray-800 truncate">{testCase.title}</span>
                <span className="ml-auto text-[11px] text-gray-400 shrink-0">
                  {testCase.steps.length} Schritt{testCase.steps.length === 1 ? '' : 'e'}
                </span>
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor={`${fieldId}-instruction`} className="block text-xs font-medium text-gray-700 mb-1">
              Anmerkung an die KI (optional)
            </label>
            <textarea
              id={`${fieldId}-instruction`}
              value={instruction}
              onChange={event => setInstruction(event.target.value)}
              placeholder="z. B. fehlende Validierungs-Schritte ergänzen"
              rows={2}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs text-gray-600 outline-none resize-none focus:border-blue-400 transition-colors"
            />
          </div>

          <p aria-live="polite" className="text-xs text-gray-500">
            {selected.length === 0
              ? 'Wähle mindestens einen Testfall aus.'
              : `Für ${selected.length} Testfall${selected.length === 1 ? '' : '-fälle'} werden zusätzliche Schritte generiert.`}
          </p>

          <div className="flex gap-2">
            <button
              onClick={() => void generate(selected, instruction)}
              disabled={!canGenerate}
              className="flex items-center gap-1.5 h-[34px] px-3 bg-gray-900 text-white text-xs rounded-[8px] hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Sparkles size={12} />
              Steps generieren
            </button>
            <button
              onClick={onCancel}
              className="h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </>
      )}

      {state === 'generating' && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin text-blue-600" />
          <span>Zusätzliche Schritte werden generiert…</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(state === 'ready' || state === 'applying') && (
        <div className="space-y-3">
          {previews.map(preview => (
            <div key={preview.testCaseId} className="border border-gray-200 rounded-[8px] p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800 truncate">{preview.testCaseTitle}</span>
                {preview.applied && (
                  <span className="ml-auto flex items-center gap-1 text-[11px] text-emerald-700">
                    <Check size={11} />
                    Übernommen
                  </span>
                )}
              </div>

              {preview.error && (
                <div className="flex items-start gap-1.5 text-xs text-red-700">
                  <AlertCircle size={11} className="mt-0.5 shrink-0" />
                  <span>{preview.error}</span>
                </div>
              )}

              {!preview.error && preview.newSteps.length === 0 && (
                <p className="text-xs text-gray-400">Keine sinnvollen zusätzlichen Schritte gefunden.</p>
              )}

              {preview.newSteps.map((step, index) => (
                <div key={index} className="flex items-start gap-1.5">
                  <div className="flex-1 space-y-1">
                    <input
                      value={step.action}
                      onChange={event => updateNewStep(preview.testCaseId, index, { action: event.target.value })}
                      disabled={preview.applied}
                      placeholder="Aktion"
                      className="w-full px-2 py-1 border border-gray-200 rounded-[4px] text-xs text-gray-800 outline-none focus:border-blue-400 transition-colors disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <input
                      value={step.expected}
                      onChange={event => updateNewStep(preview.testCaseId, index, { expected: event.target.value })}
                      disabled={preview.applied}
                      placeholder="Erwartetes Ergebnis"
                      className="w-full px-2 py-1 border border-gray-200 rounded-[4px] text-xs text-gray-600 outline-none focus:border-blue-400 transition-colors disabled:bg-gray-50 disabled:text-gray-400"
                    />
                  </div>
                  {!preview.applied && (
                    <button
                      onClick={() => removeNewStep(preview.testCaseId, index)}
                      className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-600 transition-colors shrink-0"
                      title="Schritt entfernen"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}

          <div className="flex gap-2">
            <button
              onClick={() => void applyAll()}
              disabled={isBusy || !hasUnapplied}
              className="flex items-center gap-1.5 h-[34px] px-3 bg-gray-900 text-white text-xs rounded-[8px] hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {state === 'applying' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Änderungen übernehmen
            </button>
            <button
              onClick={handleBackToSelection}
              disabled={isBusy}
              className="h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Zurück zur Auswahl
            </button>
            <button
              onClick={onCancel}
              disabled={isBusy}
              className="h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors disabled:opacity-60"
            >
              Fertig
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
