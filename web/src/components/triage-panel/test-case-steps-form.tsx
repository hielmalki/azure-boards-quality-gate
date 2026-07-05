import { useId, useState } from 'react';
import { AlertCircle, Check, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useTestCaseSteps } from './use-test-case-steps';
import { EditableText } from './editable-text';
import type { ExistingTestCase } from './triage-domain';

const PRIMARY_BUTTON =
  'flex items-center gap-1.5 h-[34px] px-3 text-xs rounded-[8px] transition-colors bg-[#FF6200] hover:bg-[#E55800] text-white disabled:opacity-40 disabled:cursor-not-allowed';

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
            {existingTestCases.map(testCase => {
              const isSelected = selectedIds.has(testCase.id);
              return (
                <label
                  key={testCase.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-[8px] border cursor-pointer transition-colors ${
                    isSelected ? 'border-gray-300 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={event => toggleSelected(testCase.id, event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-gray-300 accent-[#FF6200] shrink-0"
                  />
                  <span className="text-sm text-gray-800 truncate">{testCase.title}</span>
                  <span className="ml-auto text-[11px] text-gray-400 shrink-0">
                    {testCase.steps.length} Schritt{testCase.steps.length === 1 ? '' : 'e'}
                  </span>
                </label>
              );
            })}
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
              className={PRIMARY_BUTTON}
            >
              <Sparkles size={12} />
              Steps generieren{selected.length > 0 ? ` (${selected.length})` : ''}
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
          {previews.map((preview, previewIndex) => (
            <div
              key={preview.testCaseId}
              className="border border-gray-200 rounded-[10px] overflow-hidden bg-white"
            >
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1 rounded-[6px] bg-white border border-gray-200 text-[11px] font-semibold text-gray-600 tabular-nums">
                  {previewIndex + 1}
                </span>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium bg-blue-50 text-blue-700 border-blue-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  Bestehend
                </span>
                <div className="flex-1" />
                {preview.applied && (
                  <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 shrink-0">
                    <Check size={11} />
                    Übernommen
                  </span>
                )}
              </div>

              <div className={`px-3.5 py-3.5 space-y-3 ${preview.applied ? 'opacity-70' : ''}`}>
                <h4 className="text-sm font-medium text-gray-800 truncate">{preview.testCaseTitle}</h4>

                {preview.error && (
                  <div className="flex items-start gap-1.5 text-xs text-red-700">
                    <AlertCircle size={11} className="mt-0.5 shrink-0" />
                    <span>{preview.error}</span>
                  </div>
                )}

                {!preview.error && preview.newSteps.length === 0 && (
                  <p className="text-xs text-gray-400">Keine sinnvollen zusätzlichen Schritte gefunden.</p>
                )}

                {preview.newSteps.length > 0 && (
                  <ol className="space-y-2">
                    {preview.newSteps.map((step, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-[18px] h-[18px] rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600 tabular-nums">
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0 space-y-1">
                          <EditableText
                            value={step.action}
                            disabled={preview.applied}
                            onChange={value => updateNewStep(preview.testCaseId, index, { action: value })}
                            className="text-gray-800"
                            placeholder="Aktion beschreiben…"
                          />
                          <div className="border-l-2 border-gray-200 pl-2">
                            <div className="text-[10px] font-semibold text-gray-400 tracking-wide uppercase mb-0.5">
                              Erwartetes Ergebnis
                            </div>
                            <EditableText
                              value={step.expected}
                              disabled={preview.applied}
                              onChange={value => updateNewStep(preview.testCaseId, index, { expected: value })}
                              className="text-gray-600"
                              placeholder="Erwartetes Ergebnis beschreiben…"
                            />
                          </div>
                        </div>
                        {!preview.applied && (
                          <button
                            onClick={() => removeNewStep(preview.testCaseId, index)}
                            className="p-1 h-fit text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-[6px] transition-colors shrink-0"
                            title="Schritt entfernen"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <button
              onClick={() => void applyAll()}
              disabled={isBusy || !hasUnapplied}
              className={PRIMARY_BUTTON}
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
