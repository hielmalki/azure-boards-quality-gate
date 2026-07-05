import {
  createConfiguredLlmProvider,
  getConfiguredLlmProviderRegistration,
} from '../providers/llm/provider-factory.js';
import { LlmProviderError } from '../providers/llm/llm-provider.js';
import { listAvailableLlmProviders } from '../providers/llm/provider-registry.js';
import { recordUsage } from './ai-usage-service.js';
import { logError, logInfo } from '../utils/logger.js';

export function getLlmProviderStatus() {
  const configuredProvider = getConfiguredLlmProviderRegistration();

  return {
    configuredProvider: {
      providerId: configuredProvider.providerId,
      displayName: configuredProvider.displayName,
      model: configuredProvider.model,
    },
    availableProviders: listAvailableLlmProviders(),
  };
}

export async function assistAnalysisWithLlm(input, usageContext = {}) {
  return runLlmTask(
    'llm.analysis_assist.completed',
    'llm.analysis_assist.failed',
    provider => provider.assistAnalysis(input),
    {
      ...usageContext,
      action: 'analysis_assist',
      issueKey: input?.issueKey ?? null,
    }
  );
}

export async function generateSuggestionWithLlm(input, usageContext = {}) {
  return runLlmTask(
    'llm.suggestion.generated',
    'llm.suggestion.generate_failed',
    provider => provider.generateSuggestion(input),
    {
      ...usageContext,
      action: 'generate_suggestion',
      issueKey: input?.issueKey ?? null,
      findingId: input?.finding?.id ?? null,
    }
  );
}

export async function generateSuggestionWithLlmStream(
  input,
  usageContext = {},
  onStreamChunk = async () => {}
) {
  const startedAtMs = Date.now();
  try {
    const provider = await createConfiguredLlmProvider();
    const providerTaskStartedAtMs = Date.now();
    const result = await provider.generateSuggestionStream(input, {
      onTextChunk: async ({ chunkText, fullText }) => {
        await onStreamChunk({
          chunkText,
          fullText,
        });
      },
    });
    const providerTaskDurationMs = Date.now() - providerTaskStartedAtMs;
    const usageWriteStartedAtMs = Date.now();
    const usageResult = await recordUsageSafely(usageContext, result.metadata?.usage ?? null);
    const usageWriteDurationMs = Date.now() - usageWriteStartedAtMs;

    result.metadata = {
      ...result.metadata,
      tokenUsage: usageResult.totals,
      timing: {
        providerTaskDurationMs,
        usageWriteDurationMs,
        totalDurationMs: Date.now() - startedAtMs,
      },
    };

    logInfo('llm.suggestion.generated_stream', {
      providerId: result.provider,
      model: result.model,
      task: result.task,
      status: result.status,
      responseId: result.metadata?.responseId ?? null,
      totalTokens: usageResult.totals?.totalTokens ?? null,
      providerTaskDurationMs,
      usageWriteDurationMs,
      totalDurationMs: Date.now() - startedAtMs,
    });

    return result;
  } catch (error) {
    const providerMetadata =
      error instanceof LlmProviderError
        ? {
            providerId: error.metadata?.providerId ?? null,
            model: error.metadata?.model ?? null,
          }
        : {
            providerId: null,
            model: null,
          };

    if (error instanceof LlmProviderError) {
      logError('llm.suggestion.generate_stream_failed', error, {
        ...providerMetadata,
        ...error.metadata,
        totalDurationMs: Date.now() - startedAtMs,
      });
      const detailMessage =
        error.metadata?.apiErrorMessage ??
        error.metadata?.refusal ??
        error.metadata?.cause ??
        error.message;
      throw new Error(detailMessage || 'LLM-Anfrage fehlgeschlagen.');
    } else {
      logError('llm.suggestion.generate_stream_failed', error, {
        ...providerMetadata,
        totalDurationMs: Date.now() - startedAtMs,
      });
      throw error;
    }
  }
}

export async function generateTestCasesWithLlm(input, usageContext = {}) {
  return runLlmTask(
    'llm.test_cases.generated',
    'llm.test_cases.generate_failed',
    provider => provider.generateTestCases(input),
    {
      ...usageContext,
      action: 'generate_test_cases',
      issueKey: input?.issueKey ?? null,
    }
  );
}

export async function generateTestStepsWithLlm(input, usageContext = {}) {
  return runLlmTask(
    'llm.test_steps.generated',
    'llm.test_steps.generate_failed',
    provider => provider.generateTestSteps(input),
    {
      ...usageContext,
      action: 'generate_test_steps',
      issueKey: input?.issueKey ?? null,
    }
  );
}

export async function reviseSuggestionWithLlm(input, usageContext = {}) {
  return runLlmTask(
    'llm.suggestion.revised',
    'llm.suggestion.revise_failed',
    provider => provider.reviseSuggestion(input),
    {
      ...usageContext,
      action: 'revise_suggestion',
      issueKey: input?.issueKey ?? null,
      findingId: input?.finding?.id ?? null,
    }
  );
}

// Token-Verbrauchstracking ist rein informell. Ein KVS-Schreibfehler hier darf
// ein bereits abgeschlossenes, korrektes LLM-Ergebnis niemals in einen
// nutzersichtbaren Fehler verwandeln – der Fehler wird geloggt und mit einem
// null-Totals-Fallback verschluckt.
async function recordUsageSafely(usageContext, usage) {
  try {
    return await recordUsage({
      accountId: usageContext.accountId ?? null,
      installationId: usageContext.installationId ?? null,
      usage,
    });
  } catch (error) {
    logError('ai.token_usage.record_failed', error);
    return { usage: null, totals: null };
  }
}

async function runLlmTask(successEvent, failureEvent, taskRunner, usageContext = {}) {
  const startedAtMs = Date.now();
  try {
    const provider = await createConfiguredLlmProvider();
    const providerTaskStartedAtMs = Date.now();
    const result = await taskRunner(provider);
    const providerTaskDurationMs = Date.now() - providerTaskStartedAtMs;
    const usageWriteStartedAtMs = Date.now();
    const usageResult = await recordUsageSafely(usageContext, result.metadata?.usage ?? null);
    const usageWriteDurationMs = Date.now() - usageWriteStartedAtMs;

    result.metadata = {
      ...result.metadata,
      tokenUsage: usageResult.totals,
      timing: {
        providerTaskDurationMs,
        usageWriteDurationMs,
        totalDurationMs: Date.now() - startedAtMs,
      },
    };

    logInfo(successEvent, {
      providerId: result.provider,
      model: result.model,
      task: result.task,
      status: result.status,
      responseId: result.metadata?.responseId ?? null,
      totalTokens: usageResult.totals?.totalTokens ?? null,
      providerTaskDurationMs,
      usageWriteDurationMs,
      totalDurationMs: Date.now() - startedAtMs,
    });
    return result;
  } catch (error) {
    const providerMetadata =
      error instanceof LlmProviderError
        ? {
            providerId: error.metadata?.providerId ?? null,
            model: error.metadata?.model ?? null,
          }
        : {
            providerId: null,
            model: null,
          };

    if (error instanceof LlmProviderError) {
      logError(failureEvent, error, {
        ...providerMetadata,
        ...error.metadata,
        totalDurationMs: Date.now() - startedAtMs,
      });
      const detailMessage =
        error.metadata?.apiErrorMessage ??
        error.metadata?.refusal ??
        error.metadata?.cause ??
        error.message;
      throw new Error(detailMessage || 'LLM-Anfrage fehlgeschlagen.');
    } else {
      logError(failureEvent, error, {
        ...providerMetadata,
        totalDurationMs: Date.now() - startedAtMs,
      });
      throw error;
    }
  }
}
