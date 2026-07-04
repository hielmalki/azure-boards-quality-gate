import { LlmProvider, LlmProviderError } from './llm-provider.js';
import { LLM_TASKS } from './llm-tasks.js';

function buildUnavailableResult(provider, task, input) {
  return {
    task,
    provider: provider.providerId,
    model: provider.model,
    status: 'unavailable',
    output: null,
    metadata: {
      reason: 'LLM-Provider ist noch nicht konfiguriert.',
      inputKeys: Object.keys(input ?? {}),
    },
  };
}

// Der deaktivierte Provider ist der sichere Standard für Umgebungen, in denen
// noch keine konkrete LLM-Integration laufen soll. Dies hält den Vertrag
// ausführbar, ohne die Codebase an OpenAI-spezifisches Verhalten zu binden.
export class DisabledLlmProvider extends LlmProvider {
  constructor() {
    super({
      providerId: 'disabled',
      displayName: 'Disabled LLM Provider',
      model: null,
    });
  }

  async assistAnalysis(input) {
    this.assertSupportedTask(LLM_TASKS.ANALYSIS_ASSIST);
    return buildUnavailableResult(this, LLM_TASKS.ANALYSIS_ASSIST, input);
  }

  async generateSuggestion(input) {
    this.assertSupportedTask(LLM_TASKS.GENERATE_SUGGESTION);
    return buildUnavailableResult(this, LLM_TASKS.GENERATE_SUGGESTION, input);
  }

  async generateSuggestionStream(input, _callbacks) {
    this.assertSupportedTask(LLM_TASKS.GENERATE_SUGGESTION);
    return buildUnavailableResult(this, LLM_TASKS.GENERATE_SUGGESTION, input);
  }

  async reviseSuggestion(input) {
    this.assertSupportedTask(LLM_TASKS.REVISE_SUGGESTION);
    return buildUnavailableResult(this, LLM_TASKS.REVISE_SUGGESTION, input);
  }
}

export function assertConfiguredProvider(providerId) {
  if (providerId === 'disabled') {
    throw new LlmProviderError('Für diese Umgebung ist kein konkreter LLM-Provider konfiguriert.', {
      providerId,
    });
  }
}
