import sanitizeHtml from 'sanitize-html';
import { mapWithConcurrency } from '../utils/concurrency.js';

const ALLOWED_HTML_TAGS = ['p', 'ul', 'ol', 'li', 'br', 'b', 'i', 'strong', 'em'];

// Begrenzte Parallelität beim Anlegen mehrerer Test-Case-Work-Items. Jedes Anlegen
// ist ein unabhängiger ADO-Schreibzugriff; 2 hält die Latenz unter dem N-fachen der
// Einzelaufrufzeit, ohne die ADO-Rate-Limits zu belasten.
const TEST_CASE_CREATE_CONCURRENCY = 2;

const DEFAULT_PRIORITY = 2;

function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizePriority(priority) {
  const parsed = Number(priority);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 4 ? parsed : DEFAULT_PRIORITY;
}

function buildIssueContext(issue) {
  return {
    title: issue?.summary ?? null,
    summary: issue?.summary ?? null,
    description: issue?.description ?? null,
    acceptanceCriteria: issue?.acceptanceCriteria ?? null,
    issueType: issue?.issueType?.name ?? null,
  };
}

function buildExistingTestCasesContext(existingTestCases) {
  return (Array.isArray(existingTestCases) ? existingTestCases : []).map(testCase => ({
    title: testCase?.title ?? '',
    steps: Array.isArray(testCase?.steps) ? testCase.steps : [],
  }));
}

// Grenzen für die vom Nutzer gewählte Generierungs-Konfiguration. Bewusst
// defensiv: der Payload kommt aus dem Web-Formular, wird aber hier serverseitig
// geclamped, damit weder ein manipulierter Request noch ein UI-Bug einen
// überdimensionierten LLM-Auftrag (Kosten/Latenz) auslösen kann.
const MAX_COUNT_PER_TYPE = 10;
const MAX_TOTAL_TEST_CASES = 15;
const MIN_STEPS_PER_CASE = 1;
const MAX_STEPS_PER_CASE = 10;
const DEFAULT_STEPS_PER_CASE = 4;

const TEST_CASE_TYPE_LABELS = {
  happyPath: 'Happy Path (Erfolgsfälle)',
  negative: 'Negativfälle (Fehler-/Ausnahmeverhalten)',
  edge: 'Randfälle (Grenzwerte/Sonderfälle)',
};

function clampInt(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

// Normalisiert die Formular-Konfiguration in eine für den Prompt geeignete,
// begrenzte Struktur. Gibt null zurück, wenn keine Konfiguration übergeben wurde
// (dann verhält sich die Generierung wie zuvor – freie Ableitung aus den AK).
export function normalizeGenerationConfig(config) {
  if (!config || typeof config !== 'object') {
    return null;
  }

  const rawTypes = config.types && typeof config.types === 'object' ? config.types : {};
  const types = [];
  let total = 0;

  for (const [key, label] of Object.entries(TEST_CASE_TYPE_LABELS)) {
    const rawType = rawTypes[key];
    const enabled = Boolean(rawType?.enabled);
    if (!enabled) {
      continue;
    }
    const remaining = Math.max(0, MAX_TOTAL_TEST_CASES - total);
    if (remaining === 0) {
      break;
    }
    const count = Math.min(remaining, clampInt(rawType?.count, 1, MAX_COUNT_PER_TYPE, 1));
    if (count <= 0) {
      continue;
    }
    total += count;
    types.push({ key, label, count });
  }

  if (types.length === 0) {
    return null;
  }

  return {
    types,
    total,
    stepsPerCase: clampInt(config.stepsPerCase, MIN_STEPS_PER_CASE, MAX_STEPS_PER_CASE, DEFAULT_STEPS_PER_CASE),
  };
}

export function buildTestCasesPayload({ issueKey, issue, existingTestCases, instruction, config }) {
  return {
    issueKey,
    issueContext: buildIssueContext(issue),
    existingTestCases: buildExistingTestCasesContext(existingTestCases),
    instruction: (instruction ?? '').trim() || null,
    generationConfig: normalizeGenerationConfig(config),
  };
}

function buildTestStepsPayload({ issueKey, issue, testCaseTitle, existingSteps, instruction }) {
  return {
    issueKey,
    issueContext: buildIssueContext(issue),
    testCaseTitle: testCaseTitle ?? null,
    existingSteps: Array.isArray(existingSteps)
      ? existingSteps.map(step => ({ action: step?.action ?? '', expected: step?.expected ?? '' }))
      : [],
    instruction: (instruction ?? '').trim() || null,
  };
}

export function mapTestStepsResult({ llmResult }) {
  const steps = Array.isArray(llmResult?.output?.steps) ? llmResult.output.steps : [];

  return steps
    .map(step => ({
      action: (step.action ?? '').trim(),
      expected: (step.expected ?? '').trim(),
    }))
    .filter(step => step.action || step.expected);
}

export function mapTestCasesResult({ llmResult }) {
  const testCases = Array.isArray(llmResult?.output?.testCases) ? llmResult.output.testCases : [];

  return testCases.map(testCase => ({
    title: (testCase.title ?? '').trim() || 'Testfall',
    preconditions: (testCase.preconditions ?? '').trim(),
    steps: Array.isArray(testCase.steps)
      ? testCase.steps.map(step => ({
          action: (step.action ?? '').trim(),
          expected: (step.expected ?? '').trim(),
        }))
      : [],
    priority: normalizePriority(testCase.priority),
    derivedFrom: (testCase.derivedFrom ?? '').trim() || null,
  }));
}

// Baut das Azure-DevOps-Steps-Feld (Microsoft.VSTS.TCM.Steps). ADO erwartet dieses
// Feld als XML mit je zwei parameterizedString-Einträgen (Aktion, erwartetes
// Ergebnis) pro Schritt. Die Inhalte stammen aus dem LLM-Output und müssen daher
// escaped werden – gleiches Sicherheitsmuster wie escapeHtml in
// azure-devops-apply-service-core.js.
export function buildStepsXml(steps) {
  const safeSteps = Array.isArray(steps) && steps.length > 0 ? steps : [{ action: '', expected: '' }];

  const stepXmlEntries = safeSteps
    .map(
      (step, index) => `<step id="${index + 1}" type="ActionStep">` +
        `<parameterizedString isformatted="true">${escapeHtml(step.action)}</parameterizedString>` +
        `<parameterizedString isformatted="true">${escapeHtml(step.expected)}</parameterizedString>` +
        `</step>`
    )
    .join('');

  return `<steps id="0" last="${safeSteps.length}">${stepXmlEntries}</steps>`;
}

// Baut einen HTML-Abschnitt aus den generierten Testfällen, um ihn an die
// bestehende Beschreibung anzuhängen. Direkter Aufbau aus strukturierten Daten
// (kein Freitext-Parsing nötig, da testCase-Objekte bereits strukturiert sind);
// sanitizeHtml mit derselben Tag-Whitelist wie azure-devops-apply-service-core.js
// sichert den Schreibpfad ab, da Titel/Schritte aus LLM-Output stammen.
export function buildTestCasesDescriptionAppendix(testCases) {
  const items = (Array.isArray(testCases) ? testCases : []).map(testCase => {
    const stepsHtml = (testCase.steps ?? [])
      .map(step => `<li>${escapeHtml(step.action)} → ${escapeHtml(step.expected)}</li>`)
      .join('');
    const preconditionsHtml = testCase.preconditions
      ? `<br />Vorbedingung: ${escapeHtml(testCase.preconditions)}`
      : '';

    return (
      `<li><strong>${escapeHtml(testCase.title)}</strong>${preconditionsHtml}` +
      (stepsHtml ? `<ul>${stepsHtml}</ul>` : '') +
      `</li>`
    );
  });

  const html = `<p><strong>Generierte Testfälle</strong></p><ol>${items.join('')}</ol>`;

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_HTML_TAGS,
    allowedAttributes: {},
  });
}

export function createTestCaseService({
  getNormalizedIssueFn,
  generateTestCasesWithLlmFn,
  createTestCaseWorkItemFn,
  updateIssueFieldsFn,
  fetchLinkedTestCasesFn,
  generateTestStepsWithLlmFn,
  fetchTestCaseStepsFn,
  updateTestCaseStepsFn,
}) {
  return {
    async generateTestCases({ issueKey, contextIssueKey, instruction, config, accountId, installationId }) {
      const issue = await getNormalizedIssueFn({ issueKey, contextIssueKey });

      // Die Erkennung vorhandener Testfälle darf die Generierung selbst nie
      // blockieren – schlägt der ADO-Read fehl, generiert die KI ohne
      // Duplikat-Kontext weiter, statt den gesamten Request scheitern zu lassen.
      let existingTestCases = [];
      try {
        existingTestCases = await fetchLinkedTestCasesFn({ workItemId: issue.key });
      } catch {
        existingTestCases = [];
      }

      const llmResult = await generateTestCasesWithLlmFn(
        buildTestCasesPayload({ issueKey: issue.key, issue, existingTestCases, instruction, config }),
        { accountId, installationId }
      );

      return {
        issueKey: issue.key,
        testCases: mapTestCasesResult({ llmResult }),
        existingCount: existingTestCases.length,
      };
    },

    async listExistingTestCases({ issueKey, contextIssueKey }) {
      const issue = await getNormalizedIssueFn({ issueKey, contextIssueKey });
      const existingTestCases = await fetchLinkedTestCasesFn({ workItemId: issue.key });

      return {
        issueKey: issue.key,
        existingTestCases: existingTestCases.map(testCase => ({
          id: testCase.id,
          title: testCase.title,
          state: testCase.state,
          steps: Array.isArray(testCase.steps) ? testCase.steps : [],
        })),
        count: existingTestCases.length,
      };
    },

    // Weg B (Steps ergänzen): generiert NUR eine Vorschau zusätzlicher Schritte
    // für einen bestehenden Test Case. Schreibt noch nichts – das übernimmt
    // appendStepsToTestCase erst nach expliziter Nutzerbestätigung.
    async generateStepsForExisting({
      issueKey,
      contextIssueKey,
      testCaseId,
      testCaseTitle,
      existingSteps,
      instruction,
      accountId,
      installationId,
    }) {
      const issue = await getNormalizedIssueFn({ issueKey, contextIssueKey });

      const llmResult = await generateTestStepsWithLlmFn(
        buildTestStepsPayload({ issueKey: issue.key, issue, testCaseTitle, existingSteps, instruction }),
        { accountId, installationId }
      );

      return {
        issueKey: issue.key,
        testCaseId,
        newSteps: mapTestStepsResult({ llmResult }),
      };
    },

    // Schreibt die zusammengeführten Schritte zurück. Liest den aktuellen Stand
    // frisch (statt dem möglicherweise veralteten Client-Zustand zu vertrauen),
    // da ADO Steps als EIN XML-Blob speichert – ein Patch kann keinen einzelnen
    // <step> anhängen, nur das gesamte Feld ersetzen.
    async appendStepsToTestCase({ testCaseId, newSteps }) {
      const current = await fetchTestCaseStepsFn(testCaseId);
      const mergedSteps = [...current.steps, ...(Array.isArray(newSteps) ? newSteps : [])];
      const stepsXml = buildStepsXml(mergedSteps);

      await updateTestCaseStepsFn(testCaseId, stepsXml);

      return {
        testCaseId,
        stepCount: mergedSteps.length,
        status: 'completed',
      };
    },

    async createTestCaseWorkItems({ issueKey, testCases }) {
      const requestedTestCases = Array.isArray(testCases) ? testCases : [];

      const results = await mapWithConcurrency(
        requestedTestCases,
        TEST_CASE_CREATE_CONCURRENCY,
        async testCase => {
          try {
            const created = await createTestCaseWorkItemFn({
              storyId: issueKey,
              title: testCase.title,
              stepsXml: buildStepsXml(testCase.steps),
              description: testCase.preconditions || null,
            });

            return {
              status: 'completed',
              title: testCase.title,
              testCaseId: created?.id ?? null,
              error: null,
            };
          } catch (error) {
            return {
              status: 'failed',
              title: testCase.title,
              testCaseId: null,
              error: {
                code: 'TEST_CASE_CREATE_FAILED',
                message: error instanceof Error ? error.message : 'Test Case konnte nicht angelegt werden.',
              },
            };
          }
        }
      );

      return {
        issueKey,
        results,
        summary: {
          requested: requestedTestCases.length,
          succeeded: results.filter(entry => entry.status === 'completed').length,
          failed: results.filter(entry => entry.status === 'failed').length,
        },
      };
    },

    async attachTestCasesToIssue({ issueKey, contextIssueKey, testCases }) {
      const currentIssue = await getNormalizedIssueFn({ issueKey, contextIssueKey });
      const resolvedIssueKey = currentIssue.key;
      const currentDescriptionHtml = (currentIssue.description ?? '')
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => `<p>${escapeHtml(line)}</p>`)
        .join('');
      const appendix = buildTestCasesDescriptionAppendix(testCases);
      const mergedDescription = sanitizeHtml(`${currentDescriptionHtml}${appendix}`, {
        allowedTags: ALLOWED_HTML_TAGS,
        allowedAttributes: {},
      });

      await updateIssueFieldsFn(resolvedIssueKey, { description: mergedDescription });

      return {
        issueKey: resolvedIssueKey,
        status: 'completed',
        attachedCount: Array.isArray(testCases) ? testCases.length : 0,
      };
    },
  };
}

export const __testUtils = {
  buildStepsXml,
  buildTestCasesPayload,
  mapTestCasesResult,
  normalizeGenerationConfig,
  buildTestStepsPayload,
  mapTestStepsResult,
};
