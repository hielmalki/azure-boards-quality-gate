/**
 * Progress snapshot emitted during an in-flight analysis run.
 * @typedef {Object} ProgressSnapshot
 * @property {string} stepKey
 * @property {number} stepIndex
 * @property {number} totalSteps
 * @property {number} progressPercent  - 0–100.
 * @property {string} message
 * @property {string} updatedAt        - ISO 8601 timestamp.
 */

/**
 * Persisted record for a single analysis run of one Jira issue.
 * @typedef {Object} AnalysisRecord
 * @property {string} issueKey
 * @property {'running' | 'completed' | 'failed'} status
 * @property {string[]} activeRulesetIds
 * @property {string} startedAt                  - ISO 8601 timestamp.
 * @property {string | null} completedAt          - ISO 8601 timestamp; null while running.
 * @property {import('./analysis-service.js').AnalysisResult | null} result
 * @property {{ code: string, message: string } | null} error
 * @property {ProgressSnapshot | null} progress
 */

function buildAnalysisRunRecord({
  issueKey,
  activeRulesetIds,
  status,
  result = null,
  error = null,
  progress = null,
  startedAt,
  completedAt,
}) {
  return {
    issueKey,
    status,
    activeRulesetIds: Array.isArray(activeRulesetIds) ? activeRulesetIds : [],
    startedAt,
    completedAt,
    result,
    error,
    progress,
  };
}

// 30 Minuten: lang genug, um redundante LLM-Neuanalysen bei wiederholtem Öffnen zu vermeiden,
// kurz genug, um Beschreibungs-Bearbeitungen in einem angemessenen Zeitfenster zu berücksichtigen.
const DEFAULT_COMPLETED_RESULT_CACHE_TTL_MS = 30 * 60 * 1000;
const ANALYSIS_PROGRESS_STEPS = [
  { key: 'loading_ticket', message: 'Ticket wird geladen' },
  { key: 'preparing_rules', message: 'Regelwerk wird vorbereitet' },
  { key: 'checking_requirements', message: 'Anforderungen werden geprüft' },
  { key: 'preparing_results', message: 'Ergebnis wird aufbereitet' },
];

function buildFrontendError(error) {
  const message = error instanceof Error ? error.message : 'Analysis failed unexpectedly.';

  return {
    code: 'ANALYSIS_FAILED',
    message,
  };
}

function buildCacheKeyFingerprint(normalizedIssue, activeRulesetIds) {
  if (!normalizedIssue) {
    return null;
  }

  const stableStringify = value => {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map(entry => stableStringify(entry)).join(',')}]`;
    }

    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
  };

  const hashString = value => {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  };

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

// Spiegelt normalizeActiveRulesets() in analysis-service.js wider, damit der Cache-Key-
// Vergleich DASSELBE (normalisierte) Regelset-Set hasht, das runRulesetAnalysis gespeichert hat.
// Ohne dies hashte eine Standard-/Leeranfrage [] während das gespeicherte Ergebnis
// ['basic-quality'] hashte – so traf der Cache für abgeschlossene Ergebnisse nie zu.
// Die Produktions-Verdrahtung injiziert die kanonische Implementierung über die Factory.
const DEFAULT_ACTIVE_RULESET_IDS_FALLBACK = ['basic-quality'];
function defaultNormalizeActiveRulesets(activeRulesetIds) {
  return Array.isArray(activeRulesetIds) && activeRulesetIds.length > 0
    ? activeRulesetIds
    : [...DEFAULT_ACTIVE_RULESET_IDS_FALLBACK];
}

function resolveCompletedResultCacheTtlMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }

  const parsedFromEnv = Number.parseInt(process.env.ANALYSIS_COMPLETED_CACHE_TTL_MS ?? '', 10);
  if (Number.isFinite(parsedFromEnv) && parsedFromEnv >= 0) {
    return parsedFromEnv;
  }

  return DEFAULT_COMPLETED_RESULT_CACHE_TTL_MS;
}

function getRecordAgeMs(timestamp, nowMs) {
  if (!timestamp) {
    return null;
  }

  const parsedTimestampMs = Date.parse(timestamp);
  if (!Number.isFinite(parsedTimestampMs)) {
    return null;
  }

  return Math.max(0, nowMs - parsedTimestampMs);
}

function buildProgressSnapshot(stepKey, overrideMessage = null) {
  const fallbackStep = ANALYSIS_PROGRESS_STEPS[0];
  const step = ANALYSIS_PROGRESS_STEPS.find(entry => entry.key === stepKey) ?? fallbackStep;
  const stepIndex = ANALYSIS_PROGRESS_STEPS.findIndex(entry => entry.key === step.key);
  const safeIndex = stepIndex < 0 ? 0 : stepIndex;
  const totalSteps = ANALYSIS_PROGRESS_STEPS.length;
  const progressPercent = Math.round(((safeIndex + 1) / totalSteps) * 100);

  return {
    stepKey: step.key,
    stepIndex: safeIndex,
    totalSteps,
    progressPercent,
    message: overrideMessage ?? step.message,
    updatedAt: new Date().toISOString(),
  };
}

const DEFAULT_STALE_RUNNING_THRESHOLD_MS = 60 * 1000;

function resolveStaleRunningThresholdMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  const parsedFromEnv = Number.parseInt(process.env.ANALYSIS_STALE_RUNNING_THRESHOLD_MS ?? '', 10);
  if (Number.isFinite(parsedFromEnv) && parsedFromEnv > 0) {
    return parsedFromEnv;
  }

  return DEFAULT_STALE_RUNNING_THRESHOLD_MS;
}

export function createAnalysisRunService({
  analyzeIssueFn,
  getStoredIssueAnalysisFn = async () => null,
  setStoredIssueAnalysisFn = async () => {},
  logInfoFn = () => {},
  logErrorFn = () => {},
  nowFn = () => Date.now(),
  completedResultCacheTtlMs,
  staleRunningThresholdMs,
  buildCacheKeyFingerprintFn = buildCacheKeyFingerprint,
  normalizeActiveRulesetsFn = defaultNormalizeActiveRulesets,
}) {
  const resolvedCompletedResultCacheTtlMs =
    resolveCompletedResultCacheTtlMs(completedResultCacheTtlMs);
  const resolvedStaleRunningThresholdMs =
    resolveStaleRunningThresholdMs(staleRunningThresholdMs);

  return {
    async startIssueAnalysis({
      issueKey,
      contextIssueKey,
      activeRulesetIds,
      accountId,
      installationId,
      normalizedIssue,
    }) {
      const resolvedIssueKey = issueKey ?? contextIssueKey ?? normalizedIssue?.key ?? null;
      const startedAt = new Date().toISOString();
      const runId = crypto.randomUUID();
      const cacheKeyFingerprint = buildCacheKeyFingerprintFn(
        normalizedIssue,
        normalizeActiveRulesetsFn(activeRulesetIds)
      );
      const existingRecord = await getStoredIssueAnalysisFn(resolvedIssueKey);
      const nowMs = nowFn();

      if (existingRecord?.status === 'running') {
        const runningAgeMs = getRecordAgeMs(existingRecord?.startedAt, nowMs);
        const isStaleRunning =
          runningAgeMs !== null && runningAgeMs > resolvedStaleRunningThresholdMs;

        if (isStaleRunning) {
          logInfoFn('analysis.run.stale_running_replaced', {
            issueKey: resolvedIssueKey,
            runId,
            staleRunningAgeMs: runningAgeMs,
            staleRunningThresholdMs: resolvedStaleRunningThresholdMs,
          });
          // Durchfall: neuen Analyse-Lauf unten starten.
        } else {
          logInfoFn('analysis.run.reused_running', {
            issueKey: resolvedIssueKey,
            runId,
            runningAgeMs,
          });

          return {
            issueKey: existingRecord.issueKey ?? resolvedIssueKey,
            status: 'running',
            startedAt: existingRecord.startedAt ?? startedAt,
            completedAt: null,
            resultAvailable: false,
            error: null,
            runId,
            reusedRunning: true,
          };
        }
      }

      const existingCacheKeyFingerprint =
        existingRecord?.result?.metadata?.cacheKeyFingerprint ?? null;
      const existingRecordAgeMs = getRecordAgeMs(existingRecord?.completedAt, nowMs);
      const isCompletedRecordFresh =
        existingRecordAgeMs !== null && existingRecordAgeMs <= resolvedCompletedResultCacheTtlMs;
      const canReuseCompletedResult =
        existingRecord?.status === 'completed' &&
        Boolean(existingRecord?.result) &&
        Boolean(cacheKeyFingerprint) &&
        existingCacheKeyFingerprint === cacheKeyFingerprint &&
        isCompletedRecordFresh;

      if (
        existingRecord?.status === 'completed' &&
        Boolean(existingRecord?.result) &&
        Boolean(cacheKeyFingerprint) &&
        existingCacheKeyFingerprint === cacheKeyFingerprint &&
        !isCompletedRecordFresh
      ) {
        logInfoFn('analysis.run.cache_stale', {
          issueKey: resolvedIssueKey,
          runId,
          cacheKeyFingerprint,
          completedResultCacheTtlMs: resolvedCompletedResultCacheTtlMs,
          cachedResultAgeMs: existingRecordAgeMs,
        });
      }

      if (canReuseCompletedResult) {
        logInfoFn('analysis.run.cache_hit', {
          issueKey: resolvedIssueKey,
          runId,
          cacheKeyFingerprint,
          completedResultCacheTtlMs: resolvedCompletedResultCacheTtlMs,
          cachedResultAgeMs: existingRecordAgeMs,
        });

        return {
          issueKey: existingRecord.issueKey ?? resolvedIssueKey,
          status: 'completed',
          startedAt: existingRecord.startedAt ?? null,
          completedAt: existingRecord.completedAt ?? null,
          resultAvailable: true,
          error: null,
          runId,
          cacheHit: true,
        };
      }

      const runningRecord = buildAnalysisRunRecord({
        issueKey: resolvedIssueKey,
        activeRulesetIds,
        status: 'running',
        progress: buildProgressSnapshot('loading_ticket'),
        startedAt,
        completedAt: null,
      });

      await setStoredIssueAnalysisFn(resolvedIssueKey, runningRecord);

      void (async () => {
        const analysisStartedAtMs = Date.now();
        try {
          let currentProgress = runningRecord.progress;
          const updateProgress = async (stepKey, message = null) => {
            currentProgress = buildProgressSnapshot(stepKey, message);
            await setStoredIssueAnalysisFn(resolvedIssueKey, {
              ...runningRecord,
              status: 'running',
              progress: currentProgress,
            });
          };

          const analysis = await analyzeIssueFn({
            issueKey,
            contextIssueKey,
            activeRulesetIds,
            accountId,
            installationId,
            normalizedIssue,
            onProgress: updateProgress,
          });

          await updateProgress('preparing_results');

          const completedAt = new Date().toISOString();
          const record = buildAnalysisRunRecord({
            issueKey: analysis.issue.key,
            activeRulesetIds: analysis.activeRulesetIds,
            status: 'completed',
            result: analysis,
            progress: buildProgressSnapshot('preparing_results', 'Analyse abgeschlossen'),
            startedAt,
            completedAt,
          });
          const persistStartedAtMs = Date.now();
          await setStoredIssueAnalysisFn(analysis.issue.key, record);

          logInfoFn('analysis.run.async_completed', {
            runId,
            issueKey: analysis.issue.key,
            analysisDurationMs: Date.now() - analysisStartedAtMs,
            resultPersistDurationMs: Date.now() - persistStartedAtMs,
            cacheKeyFingerprint: analysis?.metadata?.cacheKeyFingerprint ?? null,
          });
        } catch (error) {
          const completedAt = new Date().toISOString();
          const record = buildAnalysisRunRecord({
            issueKey: resolvedIssueKey,
            activeRulesetIds,
            status: 'failed',
            error: buildFrontendError(error),
            progress: buildProgressSnapshot(
              'preparing_results',
              'Analyse konnte nicht abgeschlossen werden'
            ),
            startedAt,
            completedAt,
          });
          const persistStartedAtMs = Date.now();
          await setStoredIssueAnalysisFn(resolvedIssueKey, record);
          logErrorFn('analysis.run.async_failed', error, {
            runId,
            issueKey: resolvedIssueKey,
            analysisDurationMs: Date.now() - analysisStartedAtMs,
            resultPersistDurationMs: Date.now() - persistStartedAtMs,
          });
        }
      })();

      return {
        issueKey: resolvedIssueKey,
        status: 'running',
        startedAt,
        completedAt: null,
        resultAvailable: false,
        error: null,
        progress: runningRecord.progress,
        runId,
      };
    },

    async getIssueAnalysisResult({ issueKey, contextIssueKey }) {
      const resolvedIssueKey = issueKey ?? contextIssueKey ?? null;
      const storedRecord = await getStoredIssueAnalysisFn(resolvedIssueKey);

      if (!storedRecord) {
        return {
          issueKey: resolvedIssueKey,
          status: 'not_started',
          startedAt: null,
          completedAt: null,
          resultAvailable: false,
          result: null,
          error: null,
          progress: null,
        };
      }

      return {
        issueKey: storedRecord.issueKey ?? resolvedIssueKey,
        status: storedRecord.status ?? 'running',
        startedAt: storedRecord.startedAt ?? null,
        completedAt: storedRecord.completedAt ?? null,
        resultAvailable: Boolean(storedRecord.result),
        result: storedRecord.result ?? null,
        error: storedRecord.error ?? null,
        progress: storedRecord.progress ?? null,
      };
    },
  };
}
