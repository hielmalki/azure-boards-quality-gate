import {
  buildMissingFindingResult,
  buildSuggestionPayload,
  getFixedCurrentText,
  getTargetField,
  mapSuggestionResult,
  normalizeFrontendError,
} from './fix-suggestion-service-core.js';

function buildRunRecord({
  issueKey,
  findingId,
  runId,
  status,
  startedAt,
  completedAt = null,
  suggestion = null,
  partialText = '',
  hasFirstChunk = false,
  error = null,
}) {
  return {
    issueKey,
    findingId,
    runId,
    status,
    startedAt,
    completedAt,
    suggestion,
    partialText,
    hasFirstChunk,
    error,
  };
}

function pickFixableFindings(analysis) {
  return [
    ...(analysis.findings?.critical ?? []),
    ...(analysis.findings?.warnings ?? []),
  ].filter(finding => finding.fixable !== false);
}

export function createFixSuggestionStreamService({
  analyzeIssueFn,
  generateSuggestionWithLlmStreamFn,
  getFixSuggestionRunFn,
  setFixSuggestionRunFn,
}) {
  return {
    async startSingleFixSuggestionStream({
      issueKey,
      contextIssueKey,
      activeRulesetIds,
      findingId,
      accountId,
      installationId,
    }) {
      const analysis = await analyzeIssueFn({
        issueKey,
        contextIssueKey,
        activeRulesetIds,
      });

      const fixableFindings = pickFixableFindings(analysis);
      const finding = fixableFindings.find(entry => entry.id === findingId);
      const resolvedIssueKey = analysis.issue.key;
      const runId = crypto.randomUUID();
      const startedAt = new Date().toISOString();

      if (!finding) {
        const missingError = {
          code: 'FINDING_NOT_AVAILABLE',
          message: 'Der angeforderte Befund steht für die aktuelle Ticket-Analyse nicht zur Verfügung.',
        };
        const missingRecord = buildRunRecord({
          issueKey: resolvedIssueKey,
          findingId,
          runId,
          status: 'failed',
          startedAt,
          completedAt: startedAt,
          suggestion: buildMissingFindingResult({
            issueKey: resolvedIssueKey,
            findingId,
          }),
          error: missingError,
        });

        await setFixSuggestionRunFn({
          issueKey: resolvedIssueKey,
          findingId,
          runId,
          record: missingRecord,
        });

        return {
          issueKey: resolvedIssueKey,
          findingId,
          runId,
          status: 'failed',
          hasFirstChunk: false,
          partialText: '',
          error: missingError,
        };
      }

      const currentTextFallback =
        getFixedCurrentText(finding.id) ??
        (getTargetField(finding.id) === 'summary'
          ? analysis.issue.summary ?? ''
          : analysis.issue.description ?? '');

      const runningRecord = buildRunRecord({
        issueKey: resolvedIssueKey,
        findingId: finding.id,
        runId,
        status: 'running',
        startedAt,
      });

      await setFixSuggestionRunFn({
        issueKey: resolvedIssueKey,
        findingId: finding.id,
        runId,
        record: runningRecord,
      });

      void (async () => {
        let chunkBuffer = '';
        let hasFirstChunk = false;
        let lastPersistedAtMs = 0;

        const persistPartial = async (force = false) => {
          const nowMs = Date.now();
          if (!force && nowMs - lastPersistedAtMs < 250) {
            return;
          }

          lastPersistedAtMs = nowMs;
          await setFixSuggestionRunFn({
            issueKey: resolvedIssueKey,
            findingId: finding.id,
            runId,
            record: {
              ...runningRecord,
              status: 'running',
              partialText: chunkBuffer,
              hasFirstChunk,
            },
          });
        };

        try {
          const llmResult = await generateSuggestionWithLlmStreamFn(
            buildSuggestionPayload({
              issueKey: resolvedIssueKey,
              issue: analysis.issue,
              finding,
            }),
            {
              accountId,
              installationId,
            },
            async ({ chunkText, fullText }) => {
              if (!chunkText) {
                return;
              }

              chunkBuffer = fullText;
              if (!hasFirstChunk) {
                hasFirstChunk = true;
              }

              await persistPartial(false);
            }
          );

          await persistPartial(true);

          const completedAt = new Date().toISOString();
          const suggestion = mapSuggestionResult({
            issueKey: resolvedIssueKey,
            issue: analysis.issue,
            finding,
            llmResult,
          });

          await setFixSuggestionRunFn({
            issueKey: resolvedIssueKey,
            findingId: finding.id,
            runId,
            record: buildRunRecord({
              issueKey: resolvedIssueKey,
              findingId: finding.id,
              runId,
              status: 'completed',
              startedAt,
              completedAt,
              suggestion: {
                ...suggestion,
                currentText: suggestion.currentText || currentTextFallback,
              },
              partialText: suggestion.suggestedText ?? chunkBuffer,
              hasFirstChunk: hasFirstChunk || Boolean(chunkBuffer),
            }),
          });
        } catch (error) {
          const normalizedError = normalizeFrontendError(error);
          const completedAt = new Date().toISOString();

          await setFixSuggestionRunFn({
            issueKey: resolvedIssueKey,
            findingId: finding.id,
            runId,
            record: buildRunRecord({
              issueKey: resolvedIssueKey,
              findingId: finding.id,
              runId,
              status: 'failed',
              startedAt,
              completedAt,
              suggestion: {
                ...buildMissingFindingResult({
                  issueKey: resolvedIssueKey,
                  findingId: finding.id,
                }),
                findingTitle: finding.title,
                targetField: getTargetField(finding.id),
                currentText: currentTextFallback,
                error: normalizedError,
              },
              partialText: chunkBuffer,
              hasFirstChunk,
              error: normalizedError,
            }),
          });
        }
      })();

      return {
        issueKey: resolvedIssueKey,
        findingId: finding.id,
        runId,
        status: 'running',
        hasFirstChunk: false,
        partialText: '',
        error: null,
      };
    },

    async getSingleFixSuggestionStreamResult({
      issueKey,
      contextIssueKey,
      findingId,
      runId,
    }) {
      const resolvedIssueKey = issueKey ?? contextIssueKey ?? null;
      const record = await getFixSuggestionRunFn({
        issueKey: resolvedIssueKey,
        findingId,
        runId,
      });

      if (!record) {
        return {
          issueKey: resolvedIssueKey,
          findingId,
          runId,
          status: 'not_started',
          hasFirstChunk: false,
          partialText: '',
          suggestion: null,
          error: null,
        };
      }

      return {
        issueKey: record.issueKey ?? resolvedIssueKey,
        findingId: record.findingId ?? findingId ?? null,
        runId: record.runId ?? runId ?? null,
        status: record.status ?? 'running',
        hasFirstChunk: Boolean(record.hasFirstChunk),
        partialText: record.partialText ?? '',
        suggestion: record.suggestion ?? null,
        error: record.error ?? null,
      };
    },
  };
}
