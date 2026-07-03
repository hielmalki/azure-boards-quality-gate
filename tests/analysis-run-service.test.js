import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisRunService } from '../src/services/analysis-run-service-core.js';
import { runRulesetAnalysis } from '../src/services/analysis-service.js';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(entry => stableStringify(entry)).join(',')}]`;
  }

  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function buildCacheKeyFingerprint(normalizedIssue, activeRulesetIds) {
  return hashString(stableStringify({
    issue: {
      key: normalizedIssue?.key ?? null,
      summary: normalizedIssue?.summary ?? null,
      description: normalizedIssue?.description ?? null,
      issueTypeName: normalizedIssue?.issueType?.name ?? null,
      priorityName: normalizedIssue?.priority?.name ?? null,
      statusName: normalizedIssue?.status?.name ?? null,
      labels: Array.isArray(normalizedIssue?.labels) ? [...normalizedIssue.labels].sort() : [],
      estimateSeconds: normalizedIssue?.estimate?.seconds ?? null,
      estimateDisplay: normalizedIssue?.estimate?.display ?? null,
    },
    activeRulesetIds: Array.isArray(activeRulesetIds) ? [...activeRulesetIds] : [],
  }));
}

async function waitFor(predicate, { timeoutMs = 250, intervalMs = 5 } = {}) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }

  throw new Error('Timed out while waiting for expected async condition.');
}

test('startIssueAnalysis stores a completed analysis result', async () => {
  const storedRecords = [];
  const analysisResult = {
    issue: {
      key: 'KAN-37',
    },
    activeRulesetIds: ['basic-quality'],
    score: 82,
    summary: {
      critical: 1,
      hints: 0,
      fulfilled: 2,
    },
    findings: {
      critical: [{ id: 'acceptance_criteria_missing' }],
      warnings: [],
      fulfilled: [{ id: 'title_present' }, { id: 'description_present' }],
    },
  };

  const service = createAnalysisRunService({
    analyzeIssueFn: async () => analysisResult,
    setStoredIssueAnalysisFn: async (issueKey, record) => {
      storedRecords.push({ issueKey, record });
    },
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-37',
    contextIssueKey: 'KAN-37',
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(run.issueKey, 'KAN-37');
  assert.equal(run.status, 'running');
  assert.equal(run.resultAvailable, false);
  assert.equal(run.error, null);
  assert.ok(typeof run.runId === 'string' && run.runId.length > 0);
  assert.ok(storedRecords.length >= 1);
  assert.ok(storedRecords.some(entry => entry.issueKey === 'KAN-37' && entry.record.status === 'running'));

  await waitFor(() => storedRecords.some(entry => entry.record.status === 'completed'));

  const completedRecordEntry = storedRecords.find(entry => entry.record.status === 'completed');
  assert.ok(completedRecordEntry);
  assert.equal(completedRecordEntry.issueKey, 'KAN-37');
  assert.deepEqual(completedRecordEntry.record.result, analysisResult);
});

test('startIssueAnalysis stores a failed analysis result in frontend-safe shape', async () => {
  const storedRecords = [];
  const service = createAnalysisRunService({
    analyzeIssueFn: async () => {
      throw new Error('Jira issue could not be analyzed');
    },
    setStoredIssueAnalysisFn: async (issueKey, record) => {
      storedRecords.push({ issueKey, record });
    },
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-38',
    contextIssueKey: 'KAN-38',
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(run.issueKey, 'KAN-38');
  assert.equal(run.status, 'running');
  assert.equal(run.resultAvailable, false);
  assert.equal(run.error, null);
  assert.ok(storedRecords.length >= 1);
  assert.ok(storedRecords.some(entry => entry.record.status === 'running'));

  await waitFor(() => storedRecords.some(entry => entry.record.status === 'failed'));

  const failedRecordEntry = storedRecords.find(entry => entry.record.status === 'failed');
  assert.ok(failedRecordEntry);
  assert.deepEqual(failedRecordEntry.record.error, {
    code: 'ANALYSIS_FAILED',
    message: 'Jira issue could not be analyzed',
  });
});

test('startIssueAnalysis reuses an already running analysis without starting a new one', async () => {
  let analyzeCalls = 0;
  let writeCalls = 0;
  const nowMs = Date.parse('2026-04-10T10:00:30.000Z');

  const service = createAnalysisRunService({
    analyzeIssueFn: async () => {
      analyzeCalls += 1;
      return {
        issue: { key: 'KAN-41' },
        activeRulesetIds: ['basic-quality'],
      };
    },
    getStoredIssueAnalysisFn: async () => ({
      issueKey: 'KAN-41',
      status: 'running',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedAt: null,
      result: null,
      error: null,
    }),
    setStoredIssueAnalysisFn: async () => {
      writeCalls += 1;
    },
    nowFn: () => nowMs,
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-41',
    contextIssueKey: 'KAN-41',
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(run.issueKey, 'KAN-41');
  assert.equal(run.status, 'running');
  assert.equal(run.resultAvailable, false);
  assert.equal(run.reusedRunning, true);
  assert.equal(analyzeCalls, 0);
  assert.equal(writeCalls, 0);
});

test('startIssueAnalysis replaces a stale running analysis and starts a new one', async () => {
  const storedRecords = [];
  const logEvents = [];
  let analyzeCalls = 0;
  const nowMs = Date.parse('2026-04-10T10:05:00.000Z'); // 300 000 ms after startedAt — well past the 60 000 ms default threshold

  const service = createAnalysisRunService({
    analyzeIssueFn: async () => {
      analyzeCalls += 1;
      return {
        issue: { key: 'KAN-44' },
        activeRulesetIds: ['basic-quality'],
      };
    },
    getStoredIssueAnalysisFn: async () => ({
      issueKey: 'KAN-44',
      status: 'running',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedAt: null,
      result: null,
      error: null,
    }),
    setStoredIssueAnalysisFn: async (issueKey, record) => {
      storedRecords.push({ issueKey, record });
    },
    logInfoFn: (event, payload) => {
      logEvents.push({ event, payload });
    },
    nowFn: () => nowMs,
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-44',
    contextIssueKey: 'KAN-44',
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(run.issueKey, 'KAN-44');
  assert.equal(run.status, 'running');
  assert.equal(run.resultAvailable, false);
  assert.notEqual(run.reusedRunning, true);

  const staleEvent = logEvents.find(entry => entry.event === 'analysis.run.stale_running_replaced');
  assert.ok(staleEvent, 'expected analysis.run.stale_running_replaced log event');
  assert.equal(staleEvent.payload.issueKey, 'KAN-44');
  assert.ok(staleEvent.payload.staleRunningAgeMs >= 300_000);
  assert.equal(staleEvent.payload.staleRunningThresholdMs, 60_000);

  assert.ok(storedRecords.some(entry => entry.record.status === 'running'));

  await waitFor(() => storedRecords.some(entry => entry.record.status === 'completed'));

  assert.equal(analyzeCalls, 1);
});

test('startIssueAnalysis reuses running analysis when staleRunningThresholdMs override keeps it fresh', async () => {
  let analyzeCalls = 0;
  let writeCalls = 0;
  const nowMs = Date.parse('2026-04-10T10:05:00.000Z'); // 300 000 ms after startedAt — still within the 600 000 ms override threshold

  const service = createAnalysisRunService({
    analyzeIssueFn: async () => {
      analyzeCalls += 1;
      return {
        issue: { key: 'KAN-45' },
        activeRulesetIds: ['basic-quality'],
      };
    },
    getStoredIssueAnalysisFn: async () => ({
      issueKey: 'KAN-45',
      status: 'running',
      startedAt: '2026-04-10T10:00:00.000Z',
      completedAt: null,
      result: null,
      error: null,
    }),
    setStoredIssueAnalysisFn: async () => {
      writeCalls += 1;
    },
    nowFn: () => nowMs,
    staleRunningThresholdMs: 600_000,
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-45',
    contextIssueKey: 'KAN-45',
    activeRulesetIds: ['basic-quality'],
  });

  assert.equal(run.issueKey, 'KAN-45');
  assert.equal(run.status, 'running');
  assert.equal(run.reusedRunning, true);
  assert.equal(analyzeCalls, 0);
  assert.equal(writeCalls, 0);
});

test('startIssueAnalysis returns cache-hit metadata when completed analysis matches current fingerprint', async () => {
  let analyzeCalls = 0;
  let writeCalls = 0;
  const nowMs = Date.parse('2026-04-10T10:02:00.000Z');
  const normalizedIssue = {
    key: 'KAN-42',
    summary: 'API response validation for /api/data',
    description: 'Beschreibung mit Nutzwert und Beispiel.',
    issueType: { name: 'Story' },
    priority: { name: 'High' },
    status: { name: 'In Progress' },
    labels: ['backend', 'api'],
    estimate: { seconds: 14400, display: '4h' },
  };
  const activeRulesetIds = ['basic-quality'];
  const cacheKeyFingerprint = buildCacheKeyFingerprint(normalizedIssue, activeRulesetIds);

  const service = createAnalysisRunService({
    analyzeIssueFn: async () => {
      analyzeCalls += 1;
      return {
        issue: { key: 'KAN-42' },
        activeRulesetIds,
      };
    },
    getStoredIssueAnalysisFn: async () => ({
      issueKey: 'KAN-42',
      status: 'completed',
      startedAt: '2026-04-10T10:01:00.000Z',
      completedAt: '2026-04-10T10:01:50.000Z',
      result: {
        issue: { key: 'KAN-42' },
        metadata: {
          cacheKeyFingerprint,
        },
      },
      error: null,
    }),
    setStoredIssueAnalysisFn: async () => {
      writeCalls += 1;
    },
    nowFn: () => nowMs,
    completedResultCacheTtlMs: 60 * 1000,
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-42',
    contextIssueKey: 'KAN-42',
    activeRulesetIds,
    normalizedIssue,
  });

  assert.equal(run.issueKey, 'KAN-42');
  assert.equal(run.status, 'completed');
  assert.equal(run.resultAvailable, true);
  assert.equal(run.cacheHit, true);
  assert.equal(analyzeCalls, 0);
  assert.equal(writeCalls, 0);
});

test('startIssueAnalysis matches the completed-result cache when the request omits activeRulesetIds (default ruleset)', async () => {
  // Regression for the fingerprint divergence: a default request (no activeRulesetIds)
  // must hash the SAME normalized ruleset set (['basic-quality']) that runRulesetAnalysis
  // persisted — otherwise the completed cache never matches and every open re-analyzes.
  let analyzeCalls = 0;
  const nowMs = Date.parse('2026-04-10T10:02:00.000Z');
  const normalizedIssue = {
    key: 'KAN-50',
    summary: 'Default ruleset cache match',
    description: 'Beschreibung mit Kontext.',
    issueType: { name: 'Story' },
    priority: { name: 'High' },
    status: { name: 'To Do' },
    labels: ['api'],
    estimate: { seconds: 7200, display: '2h' },
  };
  // Stored result was produced with the normalized ruleset set.
  const cacheKeyFingerprint = buildCacheKeyFingerprint(normalizedIssue, ['basic-quality']);

  const service = createAnalysisRunService({
    analyzeIssueFn: async () => {
      analyzeCalls += 1;
      return { issue: { key: 'KAN-50' }, activeRulesetIds: ['basic-quality'] };
    },
    getStoredIssueAnalysisFn: async () => ({
      issueKey: 'KAN-50',
      status: 'completed',
      startedAt: '2026-04-10T10:01:00.000Z',
      completedAt: '2026-04-10T10:01:50.000Z',
      result: { issue: { key: 'KAN-50' }, metadata: { cacheKeyFingerprint } },
      error: null,
    }),
    setStoredIssueAnalysisFn: async () => {},
    nowFn: () => nowMs,
    completedResultCacheTtlMs: 60 * 1000,
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-50',
    contextIssueKey: 'KAN-50',
    // No activeRulesetIds → default; must still hit the stored ['basic-quality'] cache.
    normalizedIssue,
  });

  assert.equal(run.status, 'completed');
  assert.equal(run.cacheHit, true);
  assert.equal(analyzeCalls, 0, 'default ruleset request must reuse the stored completed result');
});

test('startIssueAnalysis bypasses cache-hit when matching completed result is older than ttl', async () => {
  const storedRecords = [];
  let analyzeCalls = 0;
  const nowMs = Date.parse('2026-04-10T12:00:00.000Z');
  const normalizedIssue = {
    key: 'KAN-43',
    summary: 'Improve API response handling',
    description: 'Beschreibung mit validem Kontext.',
    issueType: { name: 'Story' },
    priority: { name: 'Medium' },
    status: { name: 'To Do' },
    labels: ['api'],
    estimate: { seconds: 7200, display: '2h' },
  };
  const activeRulesetIds = ['basic-quality'];
  const cacheKeyFingerprint = buildCacheKeyFingerprint(normalizedIssue, activeRulesetIds);

  const service = createAnalysisRunService({
    analyzeIssueFn: async () => {
      analyzeCalls += 1;
      return {
        issue: { key: 'KAN-43' },
        activeRulesetIds,
      };
    },
    getStoredIssueAnalysisFn: async () => ({
      issueKey: 'KAN-43',
      status: 'completed',
      startedAt: '2026-04-10T11:45:00.000Z',
      completedAt: '2026-04-10T11:45:00.000Z',
      result: {
        issue: { key: 'KAN-43' },
        metadata: {
          cacheKeyFingerprint,
        },
      },
      error: null,
    }),
    setStoredIssueAnalysisFn: async (issueKey, record) => {
      storedRecords.push({ issueKey, record });
    },
    nowFn: () => nowMs,
    completedResultCacheTtlMs: 60 * 1000,
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-43',
    contextIssueKey: 'KAN-43',
    activeRulesetIds,
    normalizedIssue,
  });

  assert.equal(run.issueKey, 'KAN-43');
  assert.equal(run.status, 'running');
  assert.equal(run.resultAvailable, false);
  assert.equal(run.cacheHit, undefined);
  assert.ok(storedRecords.some(entry => entry.record.status === 'running'));

  await waitFor(() => storedRecords.some(entry => entry.record.status === 'completed'));

  assert.equal(analyzeCalls, 1);
});

test('getIssueAnalysisResult returns not_started when no stored run exists', async () => {
  const service = createAnalysisRunService({
    getStoredIssueAnalysisFn: async () => null,
  });

  const result = await service.getIssueAnalysisResult({
    issueKey: 'KAN-39',
    contextIssueKey: 'KAN-39',
  });

  assert.deepEqual(result, {
    issueKey: 'KAN-39',
    status: 'not_started',
    startedAt: null,
    completedAt: null,
    resultAvailable: false,
    result: null,
    error: null,
    progress: null,
  });
});

test('getIssueAnalysisResult returns stored analysis payload', async () => {
  const storedRecord = {
    issueKey: 'KAN-40',
    status: 'completed',
    startedAt: '2026-04-01T18:00:00.000Z',
    completedAt: '2026-04-01T18:00:01.000Z',
    result: {
      issue: { key: 'KAN-40' },
      score: 100,
      summary: { critical: 0, hints: 0, fulfilled: 3 },
      findings: {
        critical: [],
        warnings: [],
        fulfilled: [{ id: 'title_present' }],
      },
    },
    error: null,
  };

  const service = createAnalysisRunService({
    getStoredIssueAnalysisFn: async () => storedRecord,
  });

  const result = await service.getIssueAnalysisResult({
    issueKey: 'KAN-40',
    contextIssueKey: 'KAN-40',
  });

  assert.equal(result.issueKey, 'KAN-40');
  assert.equal(result.status, 'completed');
  assert.equal(result.resultAvailable, true);
  assert.deepEqual(result.result, storedRecord.result);
  assert.equal(result.error, null);
});

test('real backend flow: start -> poll -> completed result for Search Filter UX ticket', async () => {
  const recordsByIssueKey = new Map();
  const issueKey = 'AI-SEARCH-UX-1';
  const normalizedIssue = {
    key: issueKey,
    summary: 'Search Filter UX verbessern',
    description: `Ticket Beschreibung: Die Filterlogik wird angepasst, damit Nutzer Ergebnisse schneller eingrenzen koennen. Die Verbesserungen zielen darauf ab, die Benutzeroberfläche intuitiver zu gestalten, was eine schnellere Navigation und gezielte Suchergebnisse ermöglicht.`,
    priority: { name: 'Medium' },
    estimate: null,
  };

  const service = createAnalysisRunService({
    analyzeIssueFn: async ({ normalizedIssue: issueFromRun, activeRulesetIds }) => {
      // Simuliert asynchronen Backend-Lauf mit echter Regeln-Auswertung.
      await new Promise(resolve => setTimeout(resolve, 20));
      return runRulesetAnalysis(issueFromRun, activeRulesetIds);
    },
    getStoredIssueAnalysisFn: async key => recordsByIssueKey.get(key) ?? null,
    setStoredIssueAnalysisFn: async (key, record) => {
      recordsByIssueKey.set(key, record);
    },
  });

  const started = await service.startIssueAnalysis({
    issueKey,
    contextIssueKey: issueKey,
    activeRulesetIds: ['basic-quality'],
    normalizedIssue,
  });

  assert.equal(started.issueKey, issueKey);
  assert.equal(started.status, 'running');
  assert.equal(started.resultAvailable, false);

  let polled = await service.getIssueAnalysisResult({ issueKey, contextIssueKey: issueKey });
  assert.equal(polled.status, 'running');
  assert.equal(polled.resultAvailable, false);

  const maxPollAttempts = 100;
  for (let attempt = 0; attempt < maxPollAttempts; attempt += 1) {
    const current = await service.getIssueAnalysisResult({ issueKey, contextIssueKey: issueKey });
    if (current.status === 'completed' && current.resultAvailable) {
      polled = current;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  assert.equal(polled.status, 'completed');
  assert.equal(polled.resultAvailable, true);
  assert.equal(polled.result?.issue?.key, issueKey);
  assert.equal(polled.result?.issue?.summary, 'Search Filter UX verbessern');
  assert.equal(polled.result?.activeRulesetIds?.[0], 'basic-quality');

  const criticalIds = (polled.result?.findings?.critical ?? []).map(finding => finding.id);
  const warningIds = (polled.result?.findings?.warnings ?? []).map(finding => finding.id);
  const fulfilledIds = (polled.result?.findings?.fulfilled ?? []).map(finding => finding.id);

  assert.deepEqual(criticalIds, ['acceptance_criteria_missing']);
  assert.deepEqual(warningIds, ['estimation_missing']);
  assert.equal(fulfilledIds.includes('title_present'), true);
  assert.equal(fulfilledIds.includes('description_present'), true);
  assert.equal(fulfilledIds.includes('priority_present'), true);
  assert.equal(polled.result?.score, 72);
});

test('startIssueAnalysis default cache TTL is 30 minutes', async () => {
  // A completed record 29 minutes old should still be a cache hit with the default TTL.
  const normalizedIssue = {
    key: 'KAN-99',
    summary: 'Cache TTL test',
    description: 'Description.',
    issueType: { name: 'Story' },
    priority: { name: 'Medium' },
    status: { name: 'Open' },
    labels: [],
    estimate: null,
  };
  const activeRulesetIds = ['basic-quality'];
  const cacheKeyFingerprint = buildCacheKeyFingerprint(normalizedIssue, activeRulesetIds);

  const completedAt = '2026-04-10T11:00:00.000Z';
  // 29 minutes after completedAt — still within 30-min default TTL
  const nowMs = Date.parse('2026-04-10T11:29:00.000Z');

  let analyzeCalls = 0;
  const service = createAnalysisRunService({
    analyzeIssueFn: async () => { analyzeCalls += 1; return {}; },
    getStoredIssueAnalysisFn: async () => ({
      issueKey: 'KAN-99',
      status: 'completed',
      startedAt: '2026-04-10T10:59:00.000Z',
      completedAt,
      result: { issue: { key: 'KAN-99' }, metadata: { cacheKeyFingerprint } },
      error: null,
    }),
    setStoredIssueAnalysisFn: async () => {},
    nowFn: () => nowMs,
    // No completedResultCacheTtlMs — uses default (30 min)
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-99',
    contextIssueKey: 'KAN-99',
    activeRulesetIds,
    normalizedIssue,
  });

  assert.equal(run.status, 'completed');
  assert.equal(run.cacheHit, true);
  assert.equal(analyzeCalls, 0, 'must not re-analyze within default 30-min TTL');
});

test('startIssueAnalysis default cache TTL expires after 30 minutes', async () => {
  const normalizedIssue = {
    key: 'KAN-100',
    summary: 'Cache TTL expiry test',
    description: 'Description.',
    issueType: { name: 'Story' },
    priority: { name: 'Medium' },
    status: { name: 'Open' },
    labels: [],
    estimate: null,
  };
  const activeRulesetIds = ['basic-quality'];
  const cacheKeyFingerprint = buildCacheKeyFingerprint(normalizedIssue, activeRulesetIds);

  const completedAt = '2026-04-10T11:00:00.000Z';
  // 31 minutes after completedAt — past the 30-min default TTL
  const nowMs = Date.parse('2026-04-10T11:31:00.000Z');

  let analyzeCalls = 0;
  const service = createAnalysisRunService({
    analyzeIssueFn: async () => { analyzeCalls += 1; return {}; },
    getStoredIssueAnalysisFn: async () => ({
      issueKey: 'KAN-100',
      status: 'completed',
      startedAt: '2026-04-10T10:59:00.000Z',
      completedAt,
      result: { issue: { key: 'KAN-100' }, metadata: { cacheKeyFingerprint } },
      error: null,
    }),
    setStoredIssueAnalysisFn: async () => {},
    nowFn: () => nowMs,
    // No completedResultCacheTtlMs — uses default (30 min)
  });

  const run = await service.startIssueAnalysis({
    issueKey: 'KAN-100',
    contextIssueKey: 'KAN-100',
    activeRulesetIds,
    normalizedIssue,
  });

  assert.equal(run.status, 'running');
  assert.equal(analyzeCalls, 1, 'must re-analyze after default 30-min TTL expires');
});
