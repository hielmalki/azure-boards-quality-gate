import { useEffect, useRef, useState } from 'react';
import { invoke } from '../../api/invoke';
import {
  DEFAULT_TEST_CASE_CONFIG,
  type AttachTestCasesResponse,
  type CreateTestCaseWorkItemsResponse,
  type ExistingTestCase,
  type GenerateTestCasesResponse,
  type ListTestCasesResponse,
  type TestCase,
  type TestCaseGenerationConfig,
} from './triage-domain';

type TestCaseFlowState =
  | 'idle'
  | 'acMissing'
  | 'checking'
  | 'configuring'
  | 'generating'
  | 'ready'
  | 'creating'
  | 'attaching';

type UseTestCaseGenerationParams = {
  issueKey: string | null | undefined;
  acceptanceCriteriaMissing?: boolean;
  onTokenUsageChanged?: () => void;
};

/**
 * Kapselt den geführten Testfall-Flow gemäß docs/testfall-generierung-flow.drawio:
 * AK-Gate (Zustand 1) -> Existenzprüfung -> Konfig-Formular (Zustand 3 / Weg A)
 * -> Generieren (Vorschau) -> Anlegen / An Story anhängen. Die eigentliche
 * AK-Fix-UI (FixFlow) wird in der Komponente wiederverwendet; hier steuern wir
 * nur den Zustand `acMissing`.
 */
export function useTestCaseGeneration({
  issueKey,
  acceptanceCriteriaMissing = false,
  onTokenUsageChanged,
}: UseTestCaseGenerationParams) {
  const [state, setState] = useState<TestCaseFlowState>('idle');
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createSummary, setCreateSummary] = useState<CreateTestCaseWorkItemsResponse['summary'] | null>(null);
  const [attachedCount, setAttachedCount] = useState<number | null>(null);
  const [existingTestCases, setExistingTestCases] = useState<ExistingTestCase[]>([]);
  const [hasExisting, setHasExisting] = useState(false);

  const isMountedRef = useRef(true);
  const activeRunIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      activeRunIdRef.current += 1;
    };
  }, []);

  const runGeneration = async (
    config: TestCaseGenerationConfig | null,
    instruction: string | null,
    isActive: () => boolean
  ) => {
    setState('generating');
    setError(null);

    try {
      const response = await invoke<GenerateTestCasesResponse>('generateTestCases', {
        issueKey,
        instruction,
        config,
      });

      if (!isActive()) return;

      setTestCases(response?.testCases ?? []);
      setState('ready');
      onTokenUsageChanged?.();
    } catch (err) {
      if (!isActive()) return;
      setError(err instanceof Error ? err.message : 'Testfälle konnten nicht generiert werden.');
      setState('configuring');
    }
  };

  // Einstieg über den Haupt-Button. Entscheidet kontextabhängig, welcher Zustand
  // angezeigt wird (AK-Gate -> Existenzprüfung -> Konfig-Formular).
  const startFlow = async () => {
    if (!issueKey) return;

    setError(null);
    setCreateSummary(null);
    setAttachedCount(null);

    // Zustand 1: Ohne Akzeptanzkriterien zuerst zum Fix leiten – kein Backend-Call nötig.
    if (acceptanceCriteriaMissing) {
      setState('acMissing');
      return;
    }

    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const isActive = () => isMountedRef.current && activeRunIdRef.current === runId;

    setState('checking');

    try {
      const listResponse = await invoke<ListTestCasesResponse>('listTestCases', { issueKey });
      if (!isActive()) return;
      setExistingTestCases(listResponse?.existingTestCases ?? []);
      setHasExisting((listResponse?.count ?? 0) > 0);
    } catch {
      // Existenzprüfung darf den Flow nicht blockieren – ohne Ergebnis behandeln
      // wir die Story als "keine vorhandenen Testfälle".
      if (!isActive()) return;
      setExistingTestCases([]);
      setHasExisting(false);
    }

    if (!isActive()) return;
    setState('configuring');
  };

  const submitConfig = async (config: TestCaseGenerationConfig, instruction: string) => {
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const isActive = () => isMountedRef.current && activeRunIdRef.current === runId;
    await runGeneration(config, instruction.trim() || null, isActive);
  };

  const cancel = () => {
    activeRunIdRef.current += 1;
    setState('idle');
    setError(null);
  };

  const updateTestCase = (index: number, patch: Partial<TestCase>) => {
    setTestCases(current => current.map((testCase, i) => (i === index ? { ...testCase, ...patch } : testCase)));
  };

  const removeTestCase = (index: number) => {
    setTestCases(current => current.filter((_, i) => i !== index));
  };

  const createWorkItems = async (selected: TestCase[]) => {
    if (!issueKey || selected.length === 0) return;

    setState('creating');
    setError(null);

    try {
      const response = await invoke<CreateTestCaseWorkItemsResponse>('createTestCaseWorkItems', {
        issueKey,
        testCases: selected,
      });

      if (!isMountedRef.current) return;

      setCreateSummary(response?.summary ?? null);
      setState('ready');
      onTokenUsageChanged?.();
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Test Cases konnten nicht angelegt werden.');
      setState('ready');
    }
  };

  const attachToStory = async (selected: TestCase[]) => {
    if (!issueKey || selected.length === 0) return;

    setState('attaching');
    setError(null);

    try {
      const response = await invoke<AttachTestCasesResponse>('attachTestCases', {
        issueKey,
        testCases: selected,
      });

      if (!isMountedRef.current) return;

      setAttachedCount(response?.attachedCount ?? selected.length);
      setState('ready');
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Testfälle konnten nicht angehängt werden.');
      setState('ready');
    }
  };

  const reset = () => {
    activeRunIdRef.current += 1;
    setState('idle');
    setTestCases([]);
    setError(null);
    setCreateSummary(null);
    setAttachedCount(null);
    setExistingTestCases([]);
    setHasExisting(false);
  };

  return {
    state,
    testCases,
    error,
    createSummary,
    attachedCount,
    existingTestCases,
    hasExisting,
    defaultConfig: DEFAULT_TEST_CASE_CONFIG,
    startFlow,
    submitConfig,
    cancel,
    updateTestCase,
    removeTestCase,
    createWorkItems,
    attachToStory,
    reset,
  };
}
