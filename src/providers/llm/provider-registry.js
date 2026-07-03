import { DisabledLlmProvider } from './disabled-llm-provider.js';
import { OpenAiLlmProvider } from './openai-provider.js';
import { getOpenAiConfig, getSelectedLlmModel, getSelectedLlmProviderId } from './provider-config.js';
import { LlmProviderError } from './llm-provider.js';

const PROVIDER_REGISTRY = {
  disabled: {
    providerId: 'disabled',
    displayName: 'Disabled LLM Provider',
    model: null,
    create() {
      return new DisabledLlmProvider();
    },
  },
  openai: {
    providerId: 'openai',
    displayName: 'OpenAI',
    model: getSelectedLlmModel(),
    async create() {
      return new OpenAiLlmProvider(await getOpenAiConfig());
    },
  },
};

export function listAvailableLlmProviders() {
  return Object.values(PROVIDER_REGISTRY).map(provider => ({
    providerId: provider.providerId,
    displayName: provider.displayName,
    model: provider.model,
  }));
}

export function getRegisteredLlmProvider(providerId) {
  const provider = PROVIDER_REGISTRY[providerId];

  if (!provider) {
    throw new LlmProviderError(`Unsupported LLM provider: ${providerId}`, {
      providerId,
      availableProviders: Object.keys(PROVIDER_REGISTRY),
    });
  }

  return provider;
}

export function getConfiguredLlmProvider() {
  return getRegisteredLlmProvider(getSelectedLlmProviderId());
}
