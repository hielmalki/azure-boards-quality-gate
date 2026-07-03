import { getConfiguredLlmProvider } from './provider-registry.js';

export async function createConfiguredLlmProvider() {
  const providerRegistration = getConfiguredLlmProvider();
  return providerRegistration.create();
}

export function getConfiguredLlmProviderRegistration() {
  return getConfiguredLlmProvider();
}
