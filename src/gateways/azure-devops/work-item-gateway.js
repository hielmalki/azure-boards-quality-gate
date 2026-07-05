// Azure DevOps Work Item Tracking (WIT) REST API Gateway.
//
// Ersetzt src/gateways/jira/jira-issue-gateway.js (Migrationsschritt 4, siehe
// docs/azure-boards-migration-architektur.md). Erzeugt bewusst dieselbe
// Jira-förmige { id, key, fields: {...} }-Struktur, die issue-service.js und
// jira-apply-service-core.js bereits konsumieren (Schritt 5) – damit bleiben
// Domain/Service unverändert und nur diese Schicht kennt das ADO-Feldmodell.
//
// Auth: SDK-Bearer-Token aus dem Request-Auth-Kontext (Schritt 3, Token-
// Passthrough), sonst Fallback auf Personal Access Token (Basic-Auth) aus
// Umgebungsvariablen – der pragmatische Einsteiger-Zwischenstand für lokale
// Entwicklung/CI ohne echten SDK-Aufruf. Die Umstellung ändert bewusst nur die
// Konfigurationsquelle, nicht die Funktionssignaturen dieses Moduls.

import { getAuthContext } from '../../auth/auth-context.js';

const API_VERSION = '7.1';

export const ACCEPTANCE_CRITERIA_FIELD_KEY = 'Microsoft.VSTS.Common.AcceptanceCriteria';
export const STEPS_FIELD_KEY = 'Microsoft.VSTS.TCM.Steps';
// ForwardName "Tested By" / ReverseName "Tests" (siehe ADO Link-Type-Referenz).
// Auf dem NEU angelegten Test Case setzen wir die Relation zur Story als
// -Reverse ("Tests"); ADO legt automatisch die reziproke -Forward-Relation
// ("Tested By") auf der Story an – genau die liest fetchLinkedTestCases weiter
// unten wieder aus.
export const TESTED_BY_REVERSE_REL = 'Microsoft.VSTS.Common.TestedBy-Reverse';
export const TESTED_BY_FORWARD_REL = 'Microsoft.VSTS.Common.TestedBy-Forward';

const WORK_ITEM_READ_FIELDS = [
  'System.Title',
  'System.Description',
  'System.WorkItemType',
  'Microsoft.VSTS.Common.Priority',
  'System.Tags',
  'System.State',
  'Microsoft.VSTS.Scheduling.OriginalEstimate',
  ACCEPTANCE_CRITERIA_FIELD_KEY,
];

// Agile-Prozess-Template: numerische Priorität 1 (höchste) .. 4 (niedrigste).
// Bei anderen Prozess-Templates (Scrum/CMMI) gilt dieselbe Skala.
const PRIORITY_NAMES = {
  1: 'Highest',
  2: 'High',
  3: 'Medium',
  4: 'Low',
};

// State-Namen des Agile-Prozess-Templates. Bei Scrum/CMMI unterscheiden sich
// die tatsächlichen State-Namen (siehe "Wichtiger Vorbehalt: Prozess-Template"
// in der Architektur-Doku) – diese Zuordnung müsste dann angepasst werden.
const STATE_CATEGORY_NAMES = {
  new: 'To Do',
  active: 'In Progress',
  resolved: 'In Progress',
  closed: 'Done',
  removed: 'Done',
};

const WORK_ITEM_ID_PATTERN = /^\d+$/;

export function isSafeWorkItemId(value) {
  return typeof value === 'string' && WORK_ITEM_ID_PATTERN.test(value);
}

function getAzureDevOpsConfig() {
  const organizationUrl = process.env.AZURE_DEVOPS_ORG_URL;
  const project = process.env.AZURE_DEVOPS_PROJECT;
  const personalAccessToken = process.env.AZURE_DEVOPS_PAT;
  const bearerToken = getAuthContext()?.token ?? null;

  if (!organizationUrl || !project) {
    throw new Error(
      'Azure DevOps ist nicht konfiguriert. AZURE_DEVOPS_ORG_URL und AZURE_DEVOPS_PROJECT müssen gesetzt sein.'
    );
  }

  if (!bearerToken && !personalAccessToken) {
    throw new Error(
      'Azure DevOps ist nicht konfiguriert. Es muss entweder ein Nutzer-Token (Auth-Kontext) oder AZURE_DEVOPS_PAT gesetzt sein.'
    );
  }

  return {
    organizationUrl: organizationUrl.replace(/\/+$/, ''),
    project,
    personalAccessToken,
    bearerToken,
  };
}

function buildAuthHeader(config) {
  if (config.bearerToken) {
    return `Bearer ${config.bearerToken}`;
  }

  const encoded = Buffer.from(`:${config.personalAccessToken}`, 'utf8').toString('base64');
  return `Basic ${encoded}`;
}

function buildWorkItemUrl({ organizationUrl, project }, path, extraParams = {}) {
  const url = new URL(`${organizationUrl}/${encodeURIComponent(project)}/_apis/wit/${path}`);
  url.searchParams.set('api-version', API_VERSION);

  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }

  return url;
}

function parseTags(tagsValue) {
  return typeof tagsValue === 'string'
    ? tagsValue.split(';').map(tag => tag.trim()).filter(Boolean)
    : [];
}

function resolvePriorityName(priorityValue) {
  return PRIORITY_NAMES[Number(priorityValue)] ?? null;
}

function resolveStatusCategoryName(stateValue) {
  const key = typeof stateValue === 'string' ? stateValue.trim().toLowerCase() : '';
  return STATE_CATEGORY_NAMES[key] ?? null;
}

function convertHoursToSeconds(hoursValue) {
  const hours = Number(hoursValue);
  return Number.isFinite(hours) && hours > 0 ? Math.round(hours * 3600) : null;
}

function translateWorkItemToIssuePayload(workItem) {
  const rawFields = workItem?.fields ?? {};
  const workItemId = workItem?.id != null ? String(workItem.id) : null;
  const originalEstimateHours = rawFields['Microsoft.VSTS.Scheduling.OriginalEstimate'];
  const estimateSeconds = convertHoursToSeconds(originalEstimateHours);

  return {
    id: workItemId,
    key: workItemId,
    fields: {
      summary: rawFields['System.Title'] ?? null,
      description: rawFields['System.Description'] ?? null,
      [ACCEPTANCE_CRITERIA_FIELD_KEY]: rawFields[ACCEPTANCE_CRITERIA_FIELD_KEY] ?? null,
      issuetype: { id: null, name: rawFields['System.WorkItemType'] ?? null },
      priority: {
        id: null,
        name: resolvePriorityName(rawFields['Microsoft.VSTS.Common.Priority']),
      },
      labels: parseTags(rawFields['System.Tags']),
      status: {
        id: null,
        name: rawFields['System.State'] ?? null,
        statusCategory: { name: resolveStatusCategoryName(rawFields['System.State']) },
      },
      timeoriginalestimate: estimateSeconds,
      timetracking: {
        originalEstimate: estimateSeconds != null ? `${originalEstimateHours}h` : null,
      },
    },
  };
}

export async function fetchIssueForAnalysis(workItemId, { fetchFn = globalThis.fetch } = {}) {
  const config = getAzureDevOpsConfig();
  const url = buildWorkItemUrl(config, `workitems/${encodeURIComponent(workItemId)}`, {
    fields: WORK_ITEM_READ_FIELDS.join(','),
  });

  const response = await fetchFn(url, {
    headers: {
      Authorization: buildAuthHeader(config),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load Azure DevOps work item ${workItemId}: ${response.status} ${response.statusText}`
    );
  }

  const workItem = await response.json();
  return translateWorkItemToIssuePayload(workItem);
}

// Bildet unsere internen Zielfeld-Namen (siehe ALLOWED_APPLY_FIELDS in
// jira-apply-service-core.js) auf JSON-Patch-Pfade der ADO-Felder ab.
const FIELD_PATH_BY_INTERNAL_KEY = {
  summary: '/fields/System.Title',
  description: '/fields/System.Description',
  acceptanceCriteria: `/fields/${ACCEPTANCE_CRITERIA_FIELD_KEY}`,
};

function buildJsonPatchDocument(fields) {
  return Object.entries(fields ?? {})
    .filter(([key]) => FIELD_PATH_BY_INTERNAL_KEY[key])
    .map(([key, value]) => ({
      op: 'add',
      path: FIELD_PATH_BY_INTERNAL_KEY[key],
      value,
    }));
}

export async function updateIssueFields(workItemId, fields, { fetchFn = globalThis.fetch } = {}) {
  const patchDocument = buildJsonPatchDocument(fields);

  if (patchDocument.length === 0) {
    return;
  }

  const config = getAzureDevOpsConfig();
  const url = buildWorkItemUrl(config, `workitems/${encodeURIComponent(workItemId)}`);

  const response = await fetchFn(url, {
    method: 'PATCH',
    headers: {
      Authorization: buildAuthHeader(config),
      'Content-Type': 'application/json-patch+json',
      Accept: 'application/json',
    },
    body: JSON.stringify(patchDocument),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => null);
    throw new Error(
      `Failed to update Azure DevOps work item ${workItemId}: ${response.status} ${response.statusText}${
        responseBody ? ` - ${responseBody}` : ''
      }`
    );
  }
}

export async function createTestCaseWorkItem(
  { storyId, title, stepsXml, description },
  { fetchFn = globalThis.fetch } = {}
) {
  const config = getAzureDevOpsConfig();
  const url = buildWorkItemUrl(config, `workitems/${encodeURIComponent('$Test Case')}`);

  const patchDocument = [
    { op: 'add', path: '/fields/System.Title', value: title },
    { op: 'add', path: `/fields/${STEPS_FIELD_KEY}`, value: stepsXml },
  ];

  if (description) {
    patchDocument.push({ op: 'add', path: '/fields/System.Description', value: description });
  }

  if (storyId) {
    patchDocument.push({
      op: 'add',
      path: '/relations/-',
      value: {
        rel: TESTED_BY_REVERSE_REL,
        url: `${config.organizationUrl}/_apis/wit/workItems/${storyId}`,
      },
    });
  }

  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(config),
      'Content-Type': 'application/json-patch+json',
      Accept: 'application/json',
    },
    body: JSON.stringify(patchDocument),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => null);
    throw new Error(
      `Failed to create Azure DevOps test case work item: ${response.status} ${response.statusText}${
        responseBody ? ` - ${responseBody}` : ''
      }`
    );
  }

  const createdWorkItem = await response.json();
  return {
    id: createdWorkItem?.id != null ? String(createdWorkItem.id) : null,
    title: createdWorkItem?.fields?.['System.Title'] ?? title,
  };
}

function unescapeHtml(text) {
  return String(text ?? '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripHtmlTags(text) {
  return String(text ?? '').replace(/<[^>]*>/g, '').trim();
}

// Umkehrung von buildStepsXml – best effort, da manuell in ADO angelegte Test
// Cases vom generierten Format abweichen können (anderes Markup, zusätzliche
// Attribute). Scheitert das Parsen, liefert die Funktion [] statt zu werfen,
// damit die Erkennung vorhandener Testfälle (Titel bleibt das Hauptsignal)
// dadurch nie fehlschlägt.
export function parseStepsXml(stepsXml) {
  if (typeof stepsXml !== 'string' || !stepsXml.trim()) {
    return [];
  }

  try {
    const stepBlocks = stepsXml.match(/<step\b[^>]*>[\s\S]*?<\/step>/g) ?? [];

    return stepBlocks.map(stepBlock => {
      const paramMatches = [
        ...stepBlock.matchAll(/<parameterizedString[^>]*>([\s\S]*?)<\/parameterizedString>/g),
      ];
      const action = paramMatches[0] ? unescapeHtml(stripHtmlTags(paramMatches[0][1])) : '';
      const expected = paramMatches[1] ? unescapeHtml(stripHtmlTags(paramMatches[1][1])) : '';
      return { action, expected };
    });
  } catch {
    return [];
  }
}

// Liest Test-Case-Work-Items, die per "Tested By"-Relation mit der Story
// verknüpft sind – egal ob sie über createTestCaseWorkItem (dieses Tool) oder
// manuell in Azure DevOps angelegt wurden. fetchIssueForAnalysis fordert
// bewusst keine Relations an (kleinerer Payload für den Analyse-Pfad), daher
// ein eigener, gezielter Request mit $expand=relations. Wichtig: Von der Story
// aus gesehen heißt die Relation "Tested By" und trägt den -Forward-rel-Wert
// (nicht -Reverse – der gilt nur auf der Seite des Test Case, siehe
// TESTED_BY_REVERSE_REL oben).
export async function fetchLinkedTestCases({ workItemId }, { fetchFn = globalThis.fetch } = {}) {
  const config = getAzureDevOpsConfig();
  const url = buildWorkItemUrl(config, `workitems/${encodeURIComponent(workItemId)}`, {
    '$expand': 'relations',
  });

  const response = await fetchFn(url, {
    headers: {
      Authorization: buildAuthHeader(config),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load Azure DevOps work item relations ${workItemId}: ${response.status} ${response.statusText}`
    );
  }

  const workItem = await response.json();
  const relations = Array.isArray(workItem?.relations) ? workItem.relations : [];
  const testCaseIds = relations
    .filter(relation => relation?.rel === TESTED_BY_FORWARD_REL)
    .map(relation => {
      const match = typeof relation?.url === 'string' ? relation.url.match(/\/(\d+)$/) : null;
      return match ? match[1] : null;
    })
    .filter(Boolean);

  if (testCaseIds.length === 0) {
    return [];
  }

  const batchUrl = buildWorkItemUrl(config, 'workitems', {
    ids: testCaseIds.join(','),
    fields: ['System.Title', STEPS_FIELD_KEY, 'System.State'].join(','),
  });

  const batchResponse = await fetchFn(batchUrl, {
    headers: {
      Authorization: buildAuthHeader(config),
      Accept: 'application/json',
    },
  });

  if (!batchResponse.ok) {
    throw new Error(
      `Azure DevOps batch test case read failed: ${batchResponse.status} ${batchResponse.statusText}`
    );
  }

  const batchData = await batchResponse.json();
  const items = Array.isArray(batchData.value) ? batchData.value : [];

  return items.map(item => ({
    id: String(item.id),
    title: item.fields?.['System.Title'] ?? '',
    state: item.fields?.['System.State'] ?? '',
    steps: parseStepsXml(item.fields?.[STEPS_FIELD_KEY]),
  }));
}

// Liest Titel + Steps EINES Test-Case-Work-Items per ID. Genutzt vom
// "Steps ergänzen"-Weg (Phase 2), um unmittelbar vor dem Zurückschreiben einen
// frischen Stand zu holen – Read-Merge-Serialize statt auf einen möglicherweise
// veralteten Client-Zustand zu vertrauen (ADO speichert Steps als EIN XML-Blob,
// ein Patch kann keinen einzelnen <step> anhängen).
export async function fetchTestCaseSteps(testCaseId, { fetchFn = globalThis.fetch } = {}) {
  const config = getAzureDevOpsConfig();
  const url = buildWorkItemUrl(config, `workitems/${encodeURIComponent(testCaseId)}`, {
    fields: ['System.Title', STEPS_FIELD_KEY].join(','),
  });

  const response = await fetchFn(url, {
    headers: {
      Authorization: buildAuthHeader(config),
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to load Azure DevOps test case ${testCaseId}: ${response.status} ${response.statusText}`
    );
  }

  const workItem = await response.json();
  return {
    id: String(testCaseId),
    title: workItem?.fields?.['System.Title'] ?? '',
    steps: parseStepsXml(workItem?.fields?.[STEPS_FIELD_KEY]),
  };
}

// Schreibt das komplette Steps-Feld eines bestehenden Test-Case-Work-Items.
// Erwartet die bereits zusammengeführte (vorhandene + neue) Steps-XML – ADO
// kennt kein Anhängen einzelner Schritte, nur ein Ersetzen des gesamten Feldes.
export async function updateTestCaseSteps(testCaseId, stepsXml, { fetchFn = globalThis.fetch } = {}) {
  const config = getAzureDevOpsConfig();
  const url = buildWorkItemUrl(config, `workitems/${encodeURIComponent(testCaseId)}`);

  const patchDocument = [{ op: 'add', path: `/fields/${STEPS_FIELD_KEY}`, value: stepsXml }];

  const response = await fetchFn(url, {
    method: 'PATCH',
    headers: {
      Authorization: buildAuthHeader(config),
      'Content-Type': 'application/json-patch+json',
      Accept: 'application/json',
    },
    body: JSON.stringify(patchDocument),
  });

  if (!response.ok) {
    const responseBody = await response.text().catch(() => null);
    throw new Error(
      `Failed to update Azure DevOps test case steps ${testCaseId}: ${response.status} ${response.statusText}${
        responseBody ? ` - ${responseBody}` : ''
      }`
    );
  }
}

// --- Duplikatssuche (WIQL) ---
// Ersetzt die bisherige JQL-Suche (duplicate-check-service.js). WIQL liefert nur
// IDs zurück, daher folgt ein Batch-Read für Titel/Status der Kandidaten.

function escapeWiqlStringLiteral(value) {
  return String(value ?? '').replace(/'/g, "''");
}

function buildDuplicateSearchWiql({ project, keywords, excludeWorkItemId }) {
  const keywordClause = keywords
    .map(keyword => `[System.Title] CONTAINS '${escapeWiqlStringLiteral(keyword)}'`)
    .join(' OR ');
  const excludeClause = excludeWorkItemId ? `AND [System.Id] <> ${excludeWorkItemId}` : '';

  return `SELECT [System.Id], [System.Title], [System.State]
FROM WorkItems
WHERE [System.TeamProject] = '${escapeWiqlStringLiteral(project)}'
AND [System.State] <> 'Closed'
AND [System.State] <> 'Removed'
AND (${keywordClause})
${excludeClause}
ORDER BY [System.ChangedDate] DESC`;
}

export async function searchDuplicateCandidates(
  { workItemId, keywords, project, maxCandidates = 5 },
  { fetchFn = globalThis.fetch } = {}
) {
  const config = getAzureDevOpsConfig();
  const targetProject = project ?? config.project;
  const safeKeywords = Array.isArray(keywords)
    ? keywords.filter(keyword => typeof keyword === 'string' && keyword.trim().length > 0)
    : [];

  if (safeKeywords.length === 0) {
    return [];
  }

  const excludeWorkItemId = isSafeWorkItemId(String(workItemId ?? '')) ? String(workItemId) : null;
  const wiql = buildDuplicateSearchWiql({
    project: targetProject,
    keywords: safeKeywords,
    excludeWorkItemId,
  });

  const searchUrl = buildWorkItemUrl(config, 'wiql', { '$top': String(maxCandidates) });
  const searchResponse = await fetchFn(searchUrl, {
    method: 'POST',
    headers: {
      Authorization: buildAuthHeader(config),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: wiql }),
  });

  if (!searchResponse.ok) {
    const responseBody = await searchResponse.text().catch(() => null);
    throw new Error(
      `Azure DevOps WIQL search failed: ${searchResponse.status} ${searchResponse.statusText}${
        responseBody ? ` - ${responseBody}` : ''
      }`
    );
  }

  const searchData = await searchResponse.json();
  const workItemRefs = Array.isArray(searchData.workItems) ? searchData.workItems : [];

  if (workItemRefs.length === 0) {
    return [];
  }

  const ids = workItemRefs.map(ref => ref.id).slice(0, maxCandidates);
  const batchUrl = buildWorkItemUrl(config, 'workitems', {
    ids: ids.join(','),
    fields: 'System.Title,System.State',
  });

  const batchResponse = await fetchFn(batchUrl, {
    headers: {
      Authorization: buildAuthHeader(config),
      Accept: 'application/json',
    },
  });

  if (!batchResponse.ok) {
    throw new Error(
      `Azure DevOps batch work item read failed: ${batchResponse.status} ${batchResponse.statusText}`
    );
  }

  const batchData = await batchResponse.json();
  const items = Array.isArray(batchData.value) ? batchData.value : [];

  return items.map(item => ({
    id: String(item.id),
    title: item.fields?.['System.Title'] ?? '',
    state: item.fields?.['System.State'] ?? '',
    stateCategory: resolveStatusCategoryName(item.fields?.['System.State']) ?? '',
  }));
}
