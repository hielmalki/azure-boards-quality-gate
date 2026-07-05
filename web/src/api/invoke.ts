import * as SDK from 'azure-devops-extension-sdk';

// Drop-in-Ersatz für `invoke` aus `@forge/bridge` (Schritt 7). Behält die
// bisherige Signatur `invoke<T>(name, payload)` bei, damit die Aufrufer
// (api-key-data.ts, rulesets-data.ts, use-analysis-flow.ts, use-fix-flow.ts,
// batch-fix-flow.tsx, useDuplicateCheck.ts, useTokenUsage.ts) nur ihren Import
// umstellen müssen. Statt eines Forge-Resolver-Aufrufs macht dieses Modul einen
// `fetch()` gegen das Azure-Functions-Backend mit dem SDK-Access-Token.
//
// Kontext-Unterschied zu Forge: Der Forge-Resolver bekam die aktuelle Issue-Id
// serverseitig injiziert (`context.extension.issue.key`). In ADO gibt es das
// nicht – die aktuelle Work-Item-Id kommt vom Extension SDK und wird einmalig
// beim Start über `setCurrentWorkItemId()` hinterlegt (siehe main.tsx).

export type InvokePayload = Record<string, unknown> | undefined;

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type RequestSpec = {
  method: HttpMethod;
  path: string;
  body?: unknown;
};

const DEFAULT_API_BASE_URL = 'https://qualitygate-ai-api.azurewebsites.net';

// SDK-Access-Tokens sind kurzlebig; ein paar Minuten Sicherheitsabstand vor dem
// tatsächlichen Ablauf vermeiden ein Wettrennen mit dem Token-Ablauf.
const TOKEN_SAFETY_MARGIN_MS = 4 * 60 * 1000;

let cachedWorkItemId: string | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

export function setCurrentWorkItemId(id: string | null) {
  cachedWorkItemId = id;
}

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  return typeof configured === 'string' && configured.length > 0 ? configured : DEFAULT_API_BASE_URL;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  const token = await SDK.getAccessToken();
  cachedToken = { value: token, expiresAt: now + TOKEN_SAFETY_MARGIN_MS };
  return token;
}

function resolveWorkItemId(payload: InvokePayload): string {
  const issueKey = payload && typeof payload === 'object' ? payload['issueKey'] : undefined;
  const id = typeof issueKey === 'string' && issueKey.length > 0 ? issueKey : cachedWorkItemId;

  if (!id) {
    throw new Error('Keine Work-Item-ID verfügbar. SDK-Kontext wurde nicht initialisiert.');
  }

  return id;
}

function buildFixSuggestionStreamResultPath(payload: InvokePayload): string {
  const findingId = payload?.['findingId'];
  const runId = payload?.['runId'];
  const query = typeof findingId === 'string' && findingId.length > 0
    ? `?findingId=${encodeURIComponent(findingId)}`
    : '';

  return `/work-items/${resolveWorkItemId(payload)}/fix-suggestions/stream/${runId}${query}`;
}

// Bildet jeden bisherigen Forge-Resolver-Namen auf Methode + Pfad des
// entsprechenden Azure-Functions-Endpunkts ab (siehe src/functions/*.js).
// `fetchLabels` hat bewusst keinen Eintrag – Labels stecken bereits über
// `System.Tags` im normalisierten Issue (siehe Schritt 6, work-items.js).
const ROUTES: Record<string, (payload: InvokePayload) => RequestSpec> = {
  getNormalizedIssue: payload => ({
    method: 'GET',
    path: `/work-items/${resolveWorkItemId(payload)}`,
  }),
  analyzeIssue: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/analyze`,
    body: { activeRulesetIds: payload?.['activeRulesetIds'] },
  }),
  startAnalysis: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/analysis`,
    body: { activeRulesetIds: payload?.['activeRulesetIds'], normalizedIssue: payload?.['normalizedIssue'] },
  }),
  getAnalysisResult: payload => ({
    method: 'GET',
    path: `/work-items/${resolveWorkItemId(payload)}/analysis`,
  }),
  getLlmProviderStatus: () => ({ method: 'GET', path: '/llm/provider' }),
  assistAnalysisWithLlm: payload => ({ method: 'POST', path: '/llm/analysis-assist', body: payload }),
  generateSuggestionWithLlm: payload => ({ method: 'POST', path: '/llm/suggestion', body: payload }),
  reviseSuggestionWithLlm: payload => ({ method: 'POST', path: '/llm/suggestion/revise', body: payload }),
  generateFixSuggestion: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/fix-suggestions`,
    body: { activeRulesetIds: payload?.['activeRulesetIds'], findingId: payload?.['findingId'] },
  }),
  startFixSuggestionStream: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/fix-suggestions/stream`,
    body: { activeRulesetIds: payload?.['activeRulesetIds'], findingId: payload?.['findingId'] },
  }),
  getFixSuggestionStreamResult: payload => ({
    method: 'GET',
    path: buildFixSuggestionStreamResultPath(payload),
  }),
  generateBatchFixSuggestions: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/fix-suggestions/batch`,
    body: { activeRulesetIds: payload?.['activeRulesetIds'], findingIds: payload?.['findingIds'] },
  }),
  applyFixSuggestion: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/apply`,
    body: { suggestion: payload?.['suggestion'] },
  }),
  applyBatchFixSuggestions: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/apply-batch`,
    body: { suggestions: payload?.['suggestions'] },
  }),
  checkDuplicates: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/duplicates`,
    body: { summary: payload?.['summary'], projectKey: payload?.['projectKey'] },
  }),
  getRulesetsState: () => ({ method: 'GET', path: '/rulesets' }),
  saveActiveRulesets: payload => ({
    method: 'POST',
    path: '/rulesets/active',
    body: { activeRulesetIds: payload?.['activeRulesetIds'] },
  }),
  createCustomRuleset: payload => ({
    method: 'POST',
    path: '/rulesets/custom',
    body: { ruleset: payload?.['ruleset'] },
  }),
  updateCustomRuleset: payload => {
    const ruleset = payload?.['ruleset'] as { id?: string } | undefined;
    return {
      method: 'PUT',
      path: `/rulesets/custom/${ruleset?.id}`,
      body: { ruleset },
    };
  },
  deleteCustomRuleset: payload => ({
    method: 'DELETE',
    path: `/rulesets/custom/${payload?.['rulesetId']}`,
  }),
  getUserState: () => ({ method: 'GET', path: '/user-state' }),
  updateUserState: payload => ({ method: 'POST', path: '/user-state', body: payload }),
  getApiKeyStatus: () => ({ method: 'GET', path: '/api-key' }),
  saveOpenAiApiKey: payload => ({
    method: 'POST',
    path: '/api-key',
    body: { apiKey: payload?.['apiKey'] },
  }),
  deleteOpenAiApiKey: () => ({ method: 'DELETE', path: '/api-key' }),
  getTokenUsage: () => ({ method: 'GET', path: '/usage' }),
  listTestCases: payload => ({
    method: 'GET',
    path: `/work-items/${resolveWorkItemId(payload)}/test-cases`,
  }),
  generateTestCases: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/test-cases`,
    body: {
      instruction: payload?.['instruction'] ?? null,
      config: payload?.['config'] ?? null,
    },
  }),
  createTestCaseWorkItems: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/test-cases/create`,
    body: { testCases: payload?.['testCases'] },
  }),
  attachTestCases: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/test-cases/attach`,
    body: { testCases: payload?.['testCases'] },
  }),
  generateTestSteps: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/test-cases/${payload?.['testCaseId']}/steps`,
    body: {
      testCaseTitle: payload?.['testCaseTitle'] ?? null,
      existingSteps: payload?.['existingSteps'] ?? [],
      instruction: payload?.['instruction'] ?? null,
    },
  }),
  applyTestSteps: payload => ({
    method: 'POST',
    path: `/work-items/${resolveWorkItemId(payload)}/test-cases/${payload?.['testCaseId']}/steps/apply`,
    body: { newSteps: payload?.['newSteps'] ?? [] },
  }),
};

type BackendError = Error & { code?: string };

export async function invoke<T>(name: string, payload?: InvokePayload): Promise<T> {
  const buildRequest = ROUTES[name];

  if (!buildRequest) {
    throw new Error(`Kein Backend-Endpunkt für "${name}" bekannt.`);
  }

  const { method, path, body } = buildRequest(payload);
  const token = await getAccessToken();

  const response = await fetch(`${getApiBaseUrl()}/api${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      responseBody?.error?.message ?? `Anfrage an "${name}" fehlgeschlagen (${response.status}).`;
    const error = new Error(message) as BackendError;
    error.code = responseBody?.error?.code;
    throw error;
  }

  return responseBody as T;
}
