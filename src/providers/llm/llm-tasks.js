// Diese Task-IDs sind der stabile Vertrag zwischen den Anwendungs-Services
// und jeder konkreten LLM-Provider-Implementierung, die wir später hinzufügen.
export const LLM_TASKS = {
  ANALYSIS_ASSIST: 'analysis_assist',
  GENERATE_SUGGESTION: 'generate_suggestion',
  REVISE_SUGGESTION: 'revise_suggestion',
  GENERATE_TEST_CASES: 'generate_test_cases',
  GENERATE_TEST_STEPS: 'generate_test_steps',
};

export function isSupportedLlmTask(task) {
  return Object.values(LLM_TASKS).includes(task);
}
