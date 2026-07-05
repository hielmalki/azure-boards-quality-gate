import { useState } from 'react';
import { invoke } from '../../api/invoke';
import type {
  ApplyTestStepsResponse,
  ExistingTestCase,
  GenerateTestStepsResponse,
  TestCaseStep,
} from './triage-domain';

type StepsFlowState = 'idle' | 'generating' | 'ready' | 'applying';

export type TestCaseStepsPreview = {
  testCaseId: string;
  testCaseTitle: string;
  newSteps: TestCaseStep[];
  applied: boolean;
  error: string | null;
};

type UseTestCaseStepsParams = {
  issueKey: string | null | undefined;
};

/**
 * Weg B (docs/testfall-generierung-flow.drawio, Zustand 2): generiert je
 * ausgewähltem, bestehendem Test Case NUR die zusätzlichen neuen Schritte
 * (Vorschau, editierbar) und schreibt sie erst nach expliziter Bestätigung
 * zusammengeführt zurück. Mehrere Testfälle werden parallel verarbeitet;
 * ein Fehler bei einem Testfall blockiert die anderen nicht.
 */
export function useTestCaseSteps({ issueKey }: UseTestCaseStepsParams) {
  const [state, setState] = useState<StepsFlowState>('idle');
  const [previews, setPreviews] = useState<TestCaseStepsPreview[]>([]);
  const [error, setError] = useState<string | null>(null);

  const generate = async (selected: ExistingTestCase[], instruction: string) => {
    if (!issueKey || selected.length === 0) return;

    setState('generating');
    setError(null);

    try {
      const results = await Promise.all(
        selected.map(async (testCase): Promise<TestCaseStepsPreview> => {
          try {
            const response = await invoke<GenerateTestStepsResponse>('generateTestSteps', {
              issueKey,
              testCaseId: testCase.id,
              testCaseTitle: testCase.title,
              existingSteps: testCase.steps,
              instruction: instruction.trim() || null,
            });

            return {
              testCaseId: testCase.id,
              testCaseTitle: testCase.title,
              newSteps: response?.newSteps ?? [],
              applied: false,
              error: null,
            };
          } catch (err) {
            return {
              testCaseId: testCase.id,
              testCaseTitle: testCase.title,
              newSteps: [],
              applied: false,
              error: err instanceof Error ? err.message : 'Schritte konnten nicht generiert werden.',
            };
          }
        })
      );

      setPreviews(results);
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Schritte konnten nicht generiert werden.');
      setState('idle');
    }
  };

  const updateNewStep = (testCaseId: string, index: number, patch: Partial<TestCaseStep>) => {
    setPreviews(current =>
      current.map(preview =>
        preview.testCaseId === testCaseId
          ? {
              ...preview,
              newSteps: preview.newSteps.map((step, i) => (i === index ? { ...step, ...patch } : step)),
            }
          : preview
      )
    );
  };

  const removeNewStep = (testCaseId: string, index: number) => {
    setPreviews(current =>
      current.map(preview =>
        preview.testCaseId === testCaseId
          ? { ...preview, newSteps: preview.newSteps.filter((_, i) => i !== index) }
          : preview
      )
    );
  };

  const applyAll = async () => {
    if (!issueKey) return;
    setState('applying');

    const updated = await Promise.all(
      previews.map(async preview => {
        if (preview.applied || preview.newSteps.length === 0) return preview;
        try {
          await invoke<ApplyTestStepsResponse>('applyTestSteps', {
            issueKey,
            testCaseId: preview.testCaseId,
            newSteps: preview.newSteps,
          });
          return { ...preview, applied: true, error: null };
        } catch (err) {
          return {
            ...preview,
            error: err instanceof Error ? err.message : 'Übernehmen fehlgeschlagen.',
          };
        }
      })
    );

    setPreviews(updated);
    setState('ready');
  };

  const reset = () => {
    setState('idle');
    setPreviews([]);
    setError(null);
  };

  return { state, previews, error, generate, updateNewStep, removeNewStep, applyAll, reset };
}
