// Provider-Auswahl ist hier zentralisiert, damit spätere Tickets nur diese
// eine Konfigurationsoberfläche erweitern müssen, statt Services im ganzen
// Backend zu ändern.
export function getSelectedLlmProviderId() {
  return process.env.LLM_PROVIDER ?? 'disabled';
}

export function getSelectedLlmModel() {
  return process.env.LLM_MODEL ?? 'gpt-4o-mini';
}

export function getOpenAiBaseUrl() {
  return process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function getOpenAiConfig() {
  // KVS-gespeicherter Schlüssel hat Vorrang vor der Umgebungsvariable, damit Admins
  // den Schlüssel über die UI aktualisieren können, ohne redeployen zu müssen.
  // Fallback auf env für bestehende Setups.
  const { getStoredOpenAiApiKey } = await import('../../repositories/app-config-repository.js');
  const storedKey = await getStoredOpenAiApiKey();

  // Forge-Resolver-Aufrufe aus der UI laufen nach ~25 s ab.
  // OpenAI-Timeout deutlich unter diesem harten Limit halten, da ein Resolver
  // auch Zeit für Issue-Analyse, Payload-Mapping und Response-Serialisierung
  // benötigt, bevor er an die UI zurückgibt.
  const configuredTimeoutMs = parseNumber(process.env.LLM_TIMEOUT_MS, 20000);
  const safeForgeTimeoutCapMs = 18000;

  return {
    apiKey: storedKey ?? process.env.OPENAI_API_KEY ?? null,
    baseUrl: getOpenAiBaseUrl(),
    model: getSelectedLlmModel(),
    timeoutMs: Math.min(configuredTimeoutMs, safeForgeTimeoutCapMs),
    maxOutputTokens: parseNumber(process.env.LLM_MAX_OUTPUT_TOKENS, 1200),
  };
}
