// Azure OpenAI (EU-Region) Provider. Nutzt denselben Task-/Prompt-/Schema-Vertrag
// wie OpenAiLlmProvider (openai-shared.js), aber die Azure-Chat-Completions-API
// als Transport: andere URL, Managed-Identity-Auth statt API-Key, andere
// Response-Form (choices[0].message.content statt Responses-API output_text).
//
// generateSuggestionStream() ist bewusst NICHT implementiert (Basisklasse wirft
// "must be implemented") – Streaming wird für keinen der aktuell an Azure OpenAI
// angebundenen Aufrufe benötigt.

import { LlmProvider, LlmProviderError } from './llm-provider.js';
import { LLM_TASKS } from './llm-tasks.js';
import {
  buildStructuredOutputSchema,
  buildTaskSystemPrompt,
  buildTaskUserPrompt,
  createTaskResult,
  isTransientLlmError,
  truncateForLog,
  validateTaskOutput,
  withRetry,
} from './openai-shared.js';
import { logInfo } from '../../utils/logger.js';

function buildResponseMetadata(responseBody) {
  return {
    responseId: responseBody?.id ?? null,
    usage: responseBody?.usage ?? null,
  };
}

export class AzureOpenAiLlmProvider extends LlmProvider {
  constructor(config) {
    super({
      providerId: 'azure-openai',
      displayName: 'Azure OpenAI (EU)',
      model: config.deployment,
    });

    this.endpoint = config.endpoint?.replace(/\/$/, '');
    this.deployment = config.deployment;
    this.apiVersion = config.apiVersion;
    this.timeoutMs = config.timeoutMs;
    this.maxOutputTokens = config.maxOutputTokens;
    // Liefert pro Aufruf ein frisches Bearer-Token für die Managed Identity
    // (z. B. getBearerTokenProvider(new DefaultAzureCredential(), ...)); für
    // Tests injizierbar.
    this.getAccessToken = config.getAccessToken;
    this.fetchFn = config.fetchFn ?? globalThis.fetch;

    if (!this.endpoint || !this.deployment || !this.apiVersion) {
      throw new LlmProviderError(
        'AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT und AZURE_OPENAI_API_VERSION sind erforderlich, wenn LLM_PROVIDER=azure-openai.',
        { providerId: this.providerId }
      );
    }

    if (typeof this.getAccessToken !== 'function') {
      throw new LlmProviderError('Azure OpenAI benötigt einen Access-Token-Provider (Managed Identity).', {
        providerId: this.providerId,
      });
    }
  }

  async assistAnalysis(input) {
    this.assertSupportedTask(LLM_TASKS.ANALYSIS_ASSIST);
    return this.runStructuredTask({
      task: LLM_TASKS.ANALYSIS_ASSIST,
      input,
      systemPrompt: buildTaskSystemPrompt(LLM_TASKS.ANALYSIS_ASSIST, input),
      userPrompt: buildTaskUserPrompt(LLM_TASKS.ANALYSIS_ASSIST, input),
    });
  }

  async generateSuggestion(input) {
    this.assertSupportedTask(LLM_TASKS.GENERATE_SUGGESTION);
    return this.runSuggestionTask(LLM_TASKS.GENERATE_SUGGESTION, input);
  }

  async reviseSuggestion(input) {
    this.assertSupportedTask(LLM_TASKS.REVISE_SUGGESTION);
    return this.runSuggestionTask(LLM_TASKS.REVISE_SUGGESTION, input);
  }

  async generateTestCases(input) {
    this.assertSupportedTask(LLM_TASKS.GENERATE_TEST_CASES);
    return this.runStructuredTask({
      task: LLM_TASKS.GENERATE_TEST_CASES,
      input,
      systemPrompt: buildTaskSystemPrompt(LLM_TASKS.GENERATE_TEST_CASES, input),
      userPrompt: buildTaskUserPrompt(LLM_TASKS.GENERATE_TEST_CASES, input),
    });
  }

  async generateTestSteps(input) {
    this.assertSupportedTask(LLM_TASKS.GENERATE_TEST_STEPS);
    return this.runStructuredTask({
      task: LLM_TASKS.GENERATE_TEST_STEPS,
      input,
      systemPrompt: buildTaskSystemPrompt(LLM_TASKS.GENERATE_TEST_STEPS, input),
      userPrompt: buildTaskUserPrompt(LLM_TASKS.GENERATE_TEST_STEPS, input),
    });
  }

  async runSuggestionTask(task, input) {
    return this.runStructuredTask({
      task,
      input,
      systemPrompt: buildTaskSystemPrompt(task, input),
      userPrompt: buildTaskUserPrompt(task, input),
    });
  }

  buildRequestUrl() {
    const url = new URL(
      `${this.endpoint}/openai/deployments/${encodeURIComponent(this.deployment)}/chat/completions`
    );
    url.searchParams.set('api-version', this.apiVersion);
    return url;
  }

  async runStructuredTask({ task, input, systemPrompt, userPrompt }) {
    const requestBody = {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: this.maxOutputTokens,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          ...buildStructuredOutputSchema(task),
          strict: true,
        },
      },
    };

    logInfo('llm.azure_openai.prompt.prepared', {
      providerId: this.providerId,
      task,
      model: this.model,
      timeoutMs: this.timeoutMs,
      maxOutputTokens: this.maxOutputTokens,
      systemPromptPreview: truncateForLog(systemPrompt),
      userPromptPreview: truncateForLog(userPrompt),
      userPromptChars: userPrompt?.length ?? 0,
    });

    return withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const accessToken = await this.getAccessToken();
          const response = await this.fetchFn(this.buildRequestUrl(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });

          const responseBody = await response.json().catch(() => null);

          if (!response.ok) {
            throw new LlmProviderError('Azure OpenAI request failed.', {
              providerId: this.providerId,
              task,
              statusCode: response.status,
              responseBody,
              apiErrorMessage: responseBody?.error?.message ?? null,
            });
          }

          const outputText = responseBody?.choices?.[0]?.message?.content;

          if (typeof outputText !== 'string' || !outputText.trim()) {
            throw new LlmProviderError('Azure OpenAI returned no structured output text.', {
              providerId: this.providerId,
              task,
              responseId: responseBody?.id ?? null,
              usage: responseBody?.usage ?? null,
            });
          }

          let parsedOutput;
          try {
            parsedOutput = JSON.parse(outputText);
          } catch (error) {
            throw new LlmProviderError('Azure OpenAI returned invalid JSON output.', {
              providerId: this.providerId,
              task,
              responseId: responseBody?.id ?? null,
              outputText,
              usage: responseBody?.usage ?? null,
              cause: error instanceof Error ? error.message : String(error),
            });
          }

          logInfo('llm.azure_openai.response.received', {
            providerId: this.providerId,
            task,
            model: this.model,
            responseId: responseBody?.id ?? null,
            outputTextPreview: truncateForLog(outputText),
            outputTextChars: outputText?.length ?? 0,
            usage: responseBody?.usage ?? null,
          });

          return createTaskResult(
            this,
            task,
            validateTaskOutput(task, parsedOutput, {
              targetField: input?.targetField ?? null,
            }),
            buildResponseMetadata(responseBody ?? null)
          );
        } catch (error) {
          if (error instanceof LlmProviderError) {
            throw error;
          }

          if (error?.name === 'AbortError') {
            throw new LlmProviderError('Azure OpenAI request timed out.', {
              providerId: this.providerId,
              task,
              timeoutMs: this.timeoutMs,
            });
          }

          throw new LlmProviderError('Azure OpenAI request failed unexpectedly.', {
            providerId: this.providerId,
            task,
            cause: error instanceof Error ? error.message : String(error),
          });
        } finally {
          clearTimeout(timeoutHandle);
        }
      },
      {
        maxAttempts: 3,
        baseDelayMs: 500,
        isRetryable: isTransientLlmError,
        onRetry: ({ attempt, error, delayMs }) => {
          logInfo('llm.azure_openai.retry', {
            providerId: this.providerId,
            task,
            attempt,
            delayMs,
            errorMessage: error.message,
            statusCode: error.metadata?.statusCode ?? null,
          });
        },
      }
    );
  }
}
