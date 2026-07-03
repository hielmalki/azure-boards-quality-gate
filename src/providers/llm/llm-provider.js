import { isSupportedLlmTask } from './llm-tasks.js';

export class LlmProviderError extends Error {
  constructor(message, metadata = {}) {
    super(message);
    this.name = 'LlmProviderError';
    this.metadata = metadata;
  }
}

// Dieser Basis-Provider dokumentiert den Vertrag, den jeder zukünftige Provider
// implementieren muss. Die Anwendungsschicht soll von diesem Vertrag abhängen,
// nicht von einem anbieter-spezifischen SDK.
export class LlmProvider {
  constructor({ providerId, displayName, model = null }) {
    this.providerId = providerId;
    this.displayName = displayName;
    this.model = model;
  }

  getDescriptor() {
    return {
      providerId: this.providerId,
      displayName: this.displayName,
      model: this.model,
    };
  }

  assertSupportedTask(task) {
    if (!isSupportedLlmTask(task)) {
      throw new LlmProviderError(`Unsupported LLM task: ${task}`, {
        providerId: this.providerId,
        task,
      });
    }
  }

  async assistAnalysis(_input) {
    throw new LlmProviderError('assistAnalysis() must be implemented by the concrete provider.', {
      providerId: this.providerId,
    });
  }

  async generateSuggestion(_input) {
    throw new LlmProviderError('generateSuggestion() must be implemented by the concrete provider.', {
      providerId: this.providerId,
    });
  }

  async generateSuggestionStream(_input, _callbacks) {
    throw new LlmProviderError('generateSuggestionStream() must be implemented by the concrete provider.', {
      providerId: this.providerId,
    });
  }

  async reviseSuggestion(_input) {
    throw new LlmProviderError('reviseSuggestion() must be implemented by the concrete provider.', {
      providerId: this.providerId,
    });
  }
}
