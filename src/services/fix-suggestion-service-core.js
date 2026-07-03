import { mapWithConcurrency } from '../utils/concurrency.js';

// Begrenzte Parallelität für die Batch-Vorschlagsgenerierung. Jedes Finding löst
// einen unabhängigen LLM-Aufruf aus; 2 hält die Latenz deutlich unter dem N-fachen
// der Einzelaufrufzeit, ohne den Rate-Limit des Anbieters zu belasten.
const BATCH_SUGGESTION_CONCURRENCY = 2;

export function normalizeFrontendError(error) {
  const rawMessage =
    error instanceof Error ? error.message : 'Vorschlagsgenerierung unerwartet fehlgeschlagen.';
  const lowerMessage = String(rawMessage).toLowerCase();
  const isTimeoutError =
    lowerMessage.includes('timed out') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('time out');

  if (isTimeoutError) {
    return {
      code: 'SUGGESTION_TIMEOUT',
      message: 'Die KI-Antwort hat zu lange gedauert. Bitte erneut versuchen.',
    };
  }

  return {
    code: 'SUGGESTION_FAILED',
    message: rawMessage,
  };
}

export function getTargetField(findingId) {
  if (findingId === 'title_missing' || findingId === 'title_present') {
    return 'summary';
  }

  if (findingId === 'acceptance_criteria_missing' || findingId === 'acceptance_criteria_present') {
    return 'acceptanceCriteria';
  }

  return 'description';
}

export function getFixedCurrentText(findingId) {
  const fixedTexts = {
    acceptance_criteria_missing: 'Keine Akzeptanzkriterien definiert',
    title_missing: 'Kein Titel vorhanden',
    description_missing: 'Keine Beschreibung vorhanden',
  };

  return fixedTexts[findingId] ?? null;
}

import {
  normalizeText,
  splitDescriptionSections,
} from '../domain/shared/description-sections.js';

function buildFullDescriptionSuggestion(currentDescription, suggestedText) {
  const normalizedSuggestion = normalizeText(suggestedText);

  if (!normalizedSuggestion) {
    return '';
  }

  const { preservedSections } = splitDescriptionSections(currentDescription);

  if (!preservedSections || splitDescriptionSections(normalizedSuggestion).preservedSections) {
    return normalizedSuggestion;
  }

  return `${normalizedSuggestion}\n\n${preservedSections}`.trim();
}

function ensureExamplesMissingParagraphFormatting({ findingId, targetField, suggestedText }) {
  if (findingId !== 'examples_missing' || targetField !== 'description') {
    return suggestedText;
  }

  return suggestedText
    .replace(/([^\n])\s+(Beispiel:)/g, '$1\n\n$2')
    .replace(/([^\n])\s+(Example:)/g, '$1\n\n$2');
}

function stripMarkdownFences(value) {
  return value
    .replace(/^\s*```(?:json|markdown|md|text)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function normalizePromptLabels(value) {
  const lines = value.split('\n');

  return lines
    .map(line => line.replace(/^\s+/, ''))
    .map(line => line.replace(/^beispiel\s*[-–:]?\s*/i, 'Beispiel: '))
    .map(line => line.replace(/^example\s*[-–:]?\s*/i, 'Example: '))
    .map(line => line.replace(/^nutzen\s*[-–:]?\s*/i, 'Nutzen: '))
    .map(line => line.replace(/^user value\s*[-–:]?\s*/i, 'User Value: '))
    .join('\n');
}

function ensureParagraphBeforeKeyLabels(value) {
  return value
    .replace(/([^\n])\s+(Beispiel:|Example:|Nutzen:|User Value:)/g, '$1\n\n$2')
    .replace(/\n{3,}/g, '\n\n');
}

function normalizeAcceptanceCriteriaFormatting(value, targetField) {
  if (targetField !== 'acceptanceCriteria') {
    return value;
  }

  const lines = value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.replace(/^[-*•]\s+/, ''));

  if (lines.length === 0) {
    return value;
  }

  const normalizedLines = lines.map((line, index) => {
    if (/^\d+\.\s+/.test(line)) {
      return line;
    }

    return `${index + 1}. ${line}`;
  });

  return normalizedLines.join('\n');
}

const BULLET_KEYWORDS =
  /bulletpoint|bullet point|bullet-point|bulletpoints|aufzählungspunkte|stichpunkte|aufzählungszeichen/i;

const MIN_COUNT_MAP = {
  zwei: 2, two: 2,
  drei: 3, three: 3,
  vier: 4, four: 4,
  fünf: 5, five: 5,
};

function detectMinBullets(text) {
  const wordMatch = text.match(
    /(?:mindestens|at\s+least)\s+(zwei|drei|vier|fünf|two|three|four|five)/i
  );
  if (wordMatch) {
    return MIN_COUNT_MAP[wordMatch[1].toLowerCase()] ?? 2;
  }

  const digitMatch = text.match(/(?:mindestens|at\s+least)\s+(\d+)/i);
  if (digitMatch) {
    const n = parseInt(digitMatch[1], 10);
    return Number.isFinite(n) && n > 0 ? n : 2;
  }

  return 2;
}

function countExistingBullets(text) {
  return (text.match(/^[\-\*•]|\d+\. /gm) ?? []).length;
}

export function ensureCustomRuleBulletFormatting({ findingId, whatShouldBeChecked, suggestedText }) {
  if (typeof findingId !== 'string' || !findingId.startsWith('custom_rule:')) {
    return suggestedText;
  }

  if (!whatShouldBeChecked || !BULLET_KEYWORDS.test(whatShouldBeChecked)) {
    return suggestedText;
  }

  const minBullets = detectMinBullets(whatShouldBeChecked);

  if (countExistingBullets(suggestedText) >= minBullets) {
    return suggestedText;
  }

  const sentences = suggestedText
    .split(/(?<=[.!?])\s+|(?<=\n)/)
    .map(s => s.trim())
    .filter(Boolean);

  if (sentences.length < minBullets) {
    return suggestedText;
  }

  const bulletBlock = sentences.map(s => `- ${s}`).join('\n');
  return bulletBlock;
}

function decodeLiteralEscapeSequences(text) {
  // Streaming-Chunks kommen manchmal als wörtliche Zwei-Zeichen-Sequenzen an,
  // z. B. Backslash-n statt einem echten Zeilenumbruch (U+000A). Zuerst am
  // doppelten Backslash aufteilen, um absichtliche Escape-Backslashes zu erhalten,
  // dann Escape-Sequenzen in jedem Fragment dekodieren und mit echtem Backslash zusammenführen.
  return text
    .split('\\\\')
    .map(fragment =>
      fragment
        .replace(/\\r\\n/g, '\r\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t'),
    )
    .join('\\');
}

function normalizeSuggestionFormatting({ targetField, findingId, suggestedText }) {
  const decoded = decodeLiteralEscapeSequences(suggestedText);
  const cleaned = stripMarkdownFences(decoded);
  const labelsNormalized = normalizePromptLabels(cleaned);
  const paragraphsNormalized = ensureParagraphBeforeKeyLabels(labelsNormalized);
  const criteriaNormalized = normalizeAcceptanceCriteriaFormatting(paragraphsNormalized, targetField);

  return ensureExamplesMissingParagraphFormatting({
    findingId,
    targetField,
    suggestedText: criteriaNormalized,
  });
}

function buildIssueContext(issue) {
  return {
    title: issue?.summary ?? null,
    summary: issue?.summary ?? null,
    description: issue?.description ?? null,
    issueType: issue?.issueType?.name ?? null,
    priority: issue?.priority?.name ?? null,
    labels: issue?.labels ?? [],
    status: issue?.status?.name ?? null,
  };
}

export function buildSuggestionPayload({ issueKey, issue, finding }) {
  const isCustomRule =
    typeof finding.id === 'string' && finding.id.startsWith('custom_rule:');
  const customRule =
    isCustomRule || finding.ruleName
      ? {
          name: finding.ruleName ?? null,
          intent: finding.ruleIntent ?? null,
          whatShouldBeChecked: finding.whatShouldBeChecked ?? null,
          example: finding.ruleExample ?? '',
          scope: finding.customRuleScope ?? null,
        }
      : null;

  return {
    issueKey,
    finding: {
      id: finding.id,
      title: finding.title,
      description: finding.description,
      impact: finding.impact,
      severity: finding.severity,
      ruleName: finding.ruleName ?? null,
      ruleIntent: finding.ruleIntent ?? null,
      whatShouldBeChecked: finding.whatShouldBeChecked ?? null,
    },
    customRule,
    issueContext: buildIssueContext(issue),
    targetField: getTargetField(finding.id),
  };
}

export function mapSuggestionResult({ issueKey, issue, finding, llmResult }) {
  const output = llmResult?.output ?? {};
  const resolvedTargetField = output.targetField ?? getTargetField(finding.id);
  const fallbackCurrentText = getFixedCurrentText(finding.id) ?? (issue?.[resolvedTargetField] ?? '');
  const normalizedSuggestedText = output.suggestedText?.trim() || '';
  const normalizedAndFormattedSuggestedText = normalizeSuggestionFormatting({
    findingId: finding.id,
    targetField: resolvedTargetField,
    suggestedText: normalizedSuggestedText,
  });
  const bulletEnforcedSuggestedText = ensureCustomRuleBulletFormatting({
    findingId: finding.id,
    whatShouldBeChecked: finding.whatShouldBeChecked ?? null,
    suggestedText: normalizedAndFormattedSuggestedText,
  });
  const composedSuggestedText =
    resolvedTargetField === 'description'
      ? buildFullDescriptionSuggestion(issue?.description ?? '', bulletEnforcedSuggestedText)
      : bulletEnforcedSuggestedText;

  return {
    issueKey,
    findingId: finding.id,
    findingTitle: finding.title,
    targetField: resolvedTargetField,
    status: 'completed',
    currentText: output.currentText?.trim() || fallbackCurrentText,
    suggestedText: composedSuggestedText,
    summary: output.summary?.trim() || 'Verbesserungsvorschlag',
    reasoning: output.reasoning?.trim() || 'Aus dem Ticketkontext abgeleiteter Vorschlag.',
    provider: llmResult?.provider ?? null,
    model: llmResult?.model ?? null,
    error: null,
  };
}

export function buildMissingFindingResult({ issueKey, findingId }) {
  return {
    issueKey,
    findingId,
    findingTitle: null,
    targetField: null,
    status: 'failed',
    currentText: '',
    suggestedText: '',
    summary: null,
    reasoning: null,
    provider: null,
    model: null,
    error: {
      code: 'FINDING_NOT_AVAILABLE',
      message: 'Der angeforderte Befund steht für die aktuelle Ticket-Analyse nicht zur Verfügung.',
    },
  };
}

export function createFixSuggestionService({
  analyzeIssueFn,
  generateSuggestionWithLlmFn,
}) {
  async function loadFixableFindings({ issueKey, contextIssueKey, activeRulesetIds }) {
    const analysis = await analyzeIssueFn({
      issueKey,
      contextIssueKey,
      activeRulesetIds,
    });

    const fixableFindings = [
      ...(analysis.findings?.critical ?? []),
      ...(analysis.findings?.warnings ?? []),
    ].filter(finding => finding.fixable !== false);

    return {
      analysis,
      fixableFindings,
    };
  }

  return {
    async generateSingleFixSuggestion({
      issueKey,
      contextIssueKey,
      activeRulesetIds,
      findingId,
      accountId,
      installationId,
    }) {
      const { analysis, fixableFindings } = await loadFixableFindings({
        issueKey,
        contextIssueKey,
        activeRulesetIds,
      });

      const finding = fixableFindings.find(entry => entry.id === findingId);

      if (!finding) {
        return {
          issueKey: analysis.issue.key,
          activeRulesetIds: analysis.activeRulesetIds,
          status: 'failed',
          suggestion: buildMissingFindingResult({
            issueKey: analysis.issue.key,
            findingId,
          }),
          error: {
            code: 'FINDING_NOT_AVAILABLE',
            message: 'Der angeforderte Befund steht für die aktuelle Ticket-Analyse nicht zur Verfügung.',
          },
        };
      }

      try {
        const llmResult = await generateSuggestionWithLlmFn(
          buildSuggestionPayload({
            issueKey: analysis.issue.key,
            issue: analysis.issue,
            finding,
          }),
          {
            accountId,
            installationId,
          }
        );

        return {
          issueKey: analysis.issue.key,
          activeRulesetIds: analysis.activeRulesetIds,
          status: 'completed',
          suggestion: mapSuggestionResult({
            issueKey: analysis.issue.key,
            issue: analysis.issue,
            finding,
            llmResult,
          }),
          error: null,
        };
      } catch (error) {
        return {
          issueKey: analysis.issue.key,
          activeRulesetIds: analysis.activeRulesetIds,
          status: 'failed',
          suggestion: {
            ...buildMissingFindingResult({
              issueKey: analysis.issue.key,
              findingId: finding.id,
            }),
            findingTitle: finding.title,
            targetField: getTargetField(finding.id),
            currentText:
              getFixedCurrentText(finding.id) ?? (analysis.issue[getTargetField(finding.id)] ?? ''),
            error: normalizeFrontendError(error),
          },
          error: normalizeFrontendError(error),
        };
      }
    },

    async generateBatchFixSuggestions({
      issueKey,
      contextIssueKey,
      activeRulesetIds,
      findingIds,
      accountId,
      installationId,
    }) {
      const { analysis, fixableFindings } = await loadFixableFindings({
        issueKey,
        contextIssueKey,
        activeRulesetIds,
      });

      const requestedFindingIds = Array.isArray(findingIds) && findingIds.length > 0
        ? findingIds
        : fixableFindings.map(finding => finding.id);

      // Findings sind unabhängig voneinander; Vorschläge mit begrenzter Parallelität generieren.
      // mapWithConcurrency bewahrt die Eingabereihenfolge im Ergebnis.
      const suggestions = await mapWithConcurrency(
        requestedFindingIds,
        BATCH_SUGGESTION_CONCURRENCY,
        async requestedFindingId => {
          const finding = fixableFindings.find(entry => entry.id === requestedFindingId);

          if (!finding) {
            return buildMissingFindingResult({
              issueKey: analysis.issue.key,
              findingId: requestedFindingId,
            });
          }

          try {
            const llmResult = await generateSuggestionWithLlmFn(
              buildSuggestionPayload({
                issueKey: analysis.issue.key,
                issue: analysis.issue,
                finding,
              }),
              {
                accountId,
                installationId,
              }
            );

            return mapSuggestionResult({
              issueKey: analysis.issue.key,
              issue: analysis.issue,
              finding,
              llmResult,
            });
          } catch (error) {
            return {
              ...buildMissingFindingResult({
                issueKey: analysis.issue.key,
                findingId: finding.id,
              }),
              findingTitle: finding.title,
              targetField: getTargetField(finding.id),
              currentText:
                getFixedCurrentText(finding.id) ?? (analysis.issue[getTargetField(finding.id)] ?? ''),
              error: normalizeFrontendError(error),
            };
          }
        }
      );

      return {
        issueKey: analysis.issue.key,
        activeRulesetIds: analysis.activeRulesetIds,
        suggestions,
        summary: {
          requested: requestedFindingIds.length,
          succeeded: suggestions.filter(entry => entry.status === 'completed').length,
          failed: suggestions.filter(entry => entry.status === 'failed').length,
        },
      };
    },
  };
}

export const __testUtils = {
  buildFullDescriptionSuggestion,
  mapSuggestionResult,
};
