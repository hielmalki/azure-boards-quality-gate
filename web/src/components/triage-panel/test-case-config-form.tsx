import { useId, useState } from 'react';
import { Info, Loader2, Sparkles } from 'lucide-react';
import { Stepper } from './stepper';
import {
  TEST_CASE_TYPE_LABELS,
  TEST_CASE_TYPE_ORDER,
  countConfiguredTestCases,
  type ExistingTestCase,
  type TestCaseGenerationConfig,
  type TestCaseTypeKey,
} from './triage-domain';

const TYPE_HINTS: Record<TestCaseTypeKey, string> = {
  happyPath: 'Erfolgsfälle',
  negative: 'Fehler-/Ausnahmeverhalten',
  edge: 'Grenzwerte/Sonderfälle',
};

const MIN_STEPS = 1;
const MAX_STEPS = 10;
const MAX_COUNT = 10;

type TestCaseConfigFormProps = {
  hasExisting: boolean;
  existingTestCases: ExistingTestCase[];
  defaultConfig: TestCaseGenerationConfig;
  isBusy: boolean;
  onGenerate: (config: TestCaseGenerationConfig, instruction: string) => void;
  onCancel: () => void;
};

/**
 * Geführtes Konfig-Formular (Zustand 3 / Weg A) gemäß
 * docs/testfall-generierung-flow.drawio: Testfall-Typen mit Anzahl je Typ,
 * Schritte pro Testfall, Anmerkung/Richtung an die KI. UX: sinnvolle Defaults,
 * Anzahl-Felder nur aktiv wenn Typ gewählt, Live-Gesamtanzahl, "Generieren"
 * deaktiviert bei Gesamtanzahl 0.
 */
export function TestCaseConfigForm({
  hasExisting,
  existingTestCases,
  defaultConfig,
  isBusy,
  onGenerate,
  onCancel,
}: TestCaseConfigFormProps) {
  const [config, setConfig] = useState<TestCaseGenerationConfig>(defaultConfig);
  const [instruction, setInstruction] = useState('');
  const fieldId = useId();

  const total = countConfiguredTestCases(config);
  const canGenerate = total > 0 && !isBusy;

  const toggleType = (key: TestCaseTypeKey, enabled: boolean) => {
    setConfig(current => ({
      ...current,
      types: { ...current.types, [key]: { ...current.types[key], enabled } },
    }));
  };

  const setCount = (key: TestCaseTypeKey, rawValue: string) => {
    const parsed = Number(rawValue);
    const count = Number.isFinite(parsed) ? Math.min(MAX_COUNT, Math.max(0, Math.round(parsed))) : 0;
    setConfig(current => ({
      ...current,
      types: { ...current.types, [key]: { ...current.types[key], count } },
    }));
  };

  const setSteps = (value: number) => {
    const stepsPerCase = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Math.round(value)));
    setConfig(current => ({ ...current, stepsPerCase }));
  };

  return (
    <div className="px-4 py-3 space-y-3">
      {hasExisting && (
        <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-[8px] p-3">
          <Info size={12} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">
              {existingTestCases.length === 1
                ? 'Für diese Story gibt es bereits einen Testfall:'
                : `Für diese Story gibt es bereits ${existingTestCases.length} Testfälle:`}
            </p>
            <ul className="mt-1 space-y-0.5 list-disc list-inside">
              {existingTestCases.map(testCase => (
                <li key={testCase.id}>{testCase.title}</li>
              ))}
            </ul>
            <p className="mt-1 text-amber-600">
              Die vorhandenen Testfälle gehen als Kontext an die KI – es werden keine Duplikate erzeugt.
            </p>
          </div>
        </div>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-gray-700 mb-1">Testfall-Typen &amp; Anzahl je Typ</legend>
        {TEST_CASE_TYPE_ORDER.map(key => {
          const type = config.types[key];
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={type.enabled}
                  onChange={event => toggleType(key, event.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 accent-[#FF6200]"
                />
                <span className="text-sm text-gray-800">{TEST_CASE_TYPE_LABELS[key]}</span>
                <span className="text-[11px] text-gray-400 truncate">{TYPE_HINTS[key]}</span>
              </label>
              <Stepper
                value={type.count}
                onChange={value => setCount(key, String(value))}
                min={0}
                max={MAX_COUNT}
                disabled={!type.enabled}
              />
            </div>
          );
        })}
      </fieldset>

      <div className="flex items-center justify-between gap-2 pt-1">
        <label className="text-xs font-medium text-gray-700">Schritte pro Testfall</label>
        <Stepper value={config.stepsPerCase} onChange={setSteps} min={MIN_STEPS} max={MAX_STEPS} />
      </div>

      <div>
        <label htmlFor={`${fieldId}-instruction`} className="block text-xs font-medium text-gray-700 mb-1">
          {hasExisting ? 'Richtung / Fokus (optional)' : 'Anmerkung an die KI (optional)'}
        </label>
        <textarea
          id={`${fieldId}-instruction`}
          value={instruction}
          onChange={event => setInstruction(event.target.value)}
          placeholder={
            hasExisting
              ? 'z. B. nur Fehlerfälle & Timeouts, keine Wiederholung vorhandener'
              : 'z. B. Fokus auf Zahlungslimits & Sonderzeichen in IBAN'
          }
          rows={2}
          className="w-full px-2 py-1.5 border border-gray-200 rounded-[6px] text-xs text-gray-600 outline-none resize-none focus:border-blue-400 transition-colors"
        />
      </div>

      <p aria-live="polite" className="text-xs text-gray-500">
        {total === 0
          ? 'Wähle mindestens einen Testfall-Typ mit Anzahl ≥ 1.'
          : `Es werden ca. ${total} Testfall${total === 1 ? '' : '-fälle'} generiert.`}
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => onGenerate(config, instruction)}
          disabled={!canGenerate}
          className="flex items-center gap-1.5 h-[34px] px-3 bg-[#FF6200] hover:bg-[#E55800] text-white text-xs rounded-[8px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          Testfälle generieren
        </button>
        <button
          onClick={onCancel}
          className="h-[34px] px-3 text-xs text-gray-600 border border-gray-200 rounded-[8px] hover:bg-gray-50 transition-colors"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}
