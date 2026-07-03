import sanitizeHtml from 'sanitize-html';
import {
  normalizeText,
  splitDescriptionSections,
} from '../domain/shared/description-sections.js';

export const ALLOWED_APPLY_FIELDS = ['summary', 'description', 'acceptanceCriteria'];

const ALLOWED_HTML_TAGS = ['p', 'ul', 'ol', 'li', 'br', 'b', 'i', 'strong', 'em'];

function buildFrontendError(code, message) {
  return {
    code,
    message,
  };
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHtmlDocument(text) {
  const lines = normalizeText(text).split('\n');
  const htmlBlocks = [];
  let index = 0;

  while (index < lines.length) {
    const trimmedLine = lines[index].trim();

    if (!trimmedLine) {
      index += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const orderedItems = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        orderedItems.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }

      htmlBlocks.push(
        `<ol>${orderedItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`
      );
      continue;
    }

    if (/^[-*•]\s+/.test(trimmedLine)) {
      const bulletItems = [];

      while (index < lines.length && /^[-*•]\s+/.test(lines[index].trim())) {
        bulletItems.push(lines[index].trim().replace(/^[-*•]\s+/, ''));
        index += 1;
      }

      htmlBlocks.push(
        `<ul>${bulletItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      );
      continue;
    }

    htmlBlocks.push(`<p>${escapeHtml(trimmedLine)}</p>`);
    index += 1;
  }

  const html = htmlBlocks.length > 0 ? htmlBlocks.join('') : '<p></p>';

  return sanitizeHtml(html, {
    allowedTags: ALLOWED_HTML_TAGS,
    allowedAttributes: {},
  });
}

function buildRevisedDescription(currentDescription, suggestedText) {
  const normalizedSuggestion = normalizeText(suggestedText);

  if (!normalizedSuggestion) {
    return normalizedSuggestion;
  }

  const { preservedSections } = splitDescriptionSections(currentDescription);

  if (!preservedSections || splitDescriptionSections(normalizedSuggestion).preservedSections) {
    return normalizedSuggestion;
  }

  return `${normalizedSuggestion}\n\n${preservedSections}`.trim();
}

function buildIssueFieldUpdate(currentIssue, suggestion) {
  const targetField = suggestion?.targetField;
  const suggestedText = normalizeText(suggestion?.suggestedText);

  if (!ALLOWED_APPLY_FIELDS.includes(targetField)) {
    throw new Error(`Nicht unterstütztes Zielfeld: ${targetField ?? 'unbekannt'}`);
  }

  if (!suggestedText) {
    throw new Error('Vorschlagstext ist erforderlich, um eine Aktualisierung durchzuführen.');
  }

  if (targetField === 'summary') {
    return {
      targetField,
      fields: {
        summary: suggestedText,
      },
    };
  }

  if (targetField === 'description') {
    return {
      targetField,
      fields: {
        description: buildHtmlDocument(
          buildRevisedDescription(currentIssue?.description ?? '', suggestedText)
        ),
      },
    };
  }

  return {
    targetField,
    fields: {
      acceptanceCriteria: buildHtmlDocument(suggestedText),
    },
  };
}

// Beschreibung und Akzeptanzkriterien erlauben mehrere Vorschläge im selben Batch
// (sie werden zusammengeführt statt als Konflikt behandelt); summary nicht.
const MERGEABLE_TARGET_GROUPS = new Set(['description', 'acceptanceCriteria']);

function detectConflict(currentIssue, suggestion) {
  const targetField = suggestion?.targetField;

  if (targetField === 'summary' || targetField === 'description') {
    const expectedCurrentText = normalizeText(suggestion?.currentText);
    return Boolean(
      expectedCurrentText && normalizeText(currentIssue?.[targetField]) !== expectedCurrentText
    );
  }

  if (targetField === 'acceptanceCriteria') {
    // Der einzige aktuelle Finding-Typ für dieses Feld ist "acceptance_criteria_missing";
    // sein currentText ist ein Platzhaltertext ("Keine Akzeptanzkriterien definiert"),
    // kein echter Feldwert. Ein Konflikt liegt vor, wenn seit der Analyse bereits
    // Akzeptanzkriterien im nativen Feld hinterlegt wurden.
    return Boolean(normalizeText(currentIssue?.acceptanceCriteria));
  }

  return false;
}

function buildAuditRecord({
  auditId,
  issueKey,
  accountId,
  suggestion,
  status,
  error = null,
}) {
  return {
    auditId,
    issueKey,
    accountId: accountId ?? null,
    findingId: suggestion?.findingId ?? null,
    findingTitle: suggestion?.findingTitle ?? null,
    targetField: suggestion?.targetField ?? null,
    currentText: suggestion?.currentText ?? '',
    suggestedText: suggestion?.suggestedText ?? '',
    status,
    error,
    appliedAt: new Date().toISOString(),
  };
}

function buildApplyResult({ issueKey, suggestion, status, error = null, auditId }) {
  return {
    issueKey,
    findingId: suggestion?.findingId ?? null,
    targetField: suggestion?.targetField ?? null,
    status,
    auditId,
    error,
  };
}

function createAuditId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createAzureDevOpsApplyService({
  getNormalizedIssueFn,
  updateIssueFieldsFn,
  storeApplyAuditRecordFn,
}) {
  async function applySingleSuggestion({ issueKey, contextIssueKey, suggestion, accountId }) {
    const currentIssue = await getNormalizedIssueFn({
      issueKey,
      contextIssueKey,
    });
    const resolvedIssueKey = currentIssue.key;
    const auditId = createAuditId();

    if (detectConflict(currentIssue, suggestion)) {
      const error = buildFrontendError(
        'ISSUE_CONFLICT',
        'Das Work Item wurde seit der Analyse verändert. Bitte die Analyse erneut ausführen.'
      );
      await storeApplyAuditRecordFn(
        resolvedIssueKey,
        auditId,
        buildAuditRecord({
          auditId,
          issueKey: resolvedIssueKey,
          accountId,
          suggestion,
          status: 'failed',
          error,
        })
      );
      return buildApplyResult({
        issueKey: resolvedIssueKey,
        suggestion,
        status: 'failed',
        error,
        auditId,
      });
    }

    try {
      const update = buildIssueFieldUpdate(currentIssue, suggestion);
      await updateIssueFieldsFn(resolvedIssueKey, update.fields);

      await storeApplyAuditRecordFn(
        resolvedIssueKey,
        auditId,
        buildAuditRecord({
          auditId,
          issueKey: resolvedIssueKey,
          accountId,
          suggestion,
          status: 'completed',
        })
      );

      return buildApplyResult({
        issueKey: resolvedIssueKey,
        suggestion,
        status: 'completed',
        auditId,
      });
    } catch (error) {
      const frontendError = buildFrontendError(
        'WORK_ITEM_UPDATE_FAILED',
        error instanceof Error ? error.message : 'Work-Item-Aktualisierung unerwartet fehlgeschlagen.'
      );

      await storeApplyAuditRecordFn(
        resolvedIssueKey,
        auditId,
        buildAuditRecord({
          auditId,
          issueKey: resolvedIssueKey,
          accountId,
          suggestion,
          status: 'failed',
          error: frontendError,
        })
      );

      return buildApplyResult({
        issueKey: resolvedIssueKey,
        suggestion,
        status: 'failed',
        error: frontendError,
        auditId,
      });
    }
  }

  return {
    async applySingleSuggestion(input) {
      return applySingleSuggestion(input);
    },

    async applyBatchSuggestions({ issueKey, contextIssueKey, suggestions, accountId }) {
      const normalizedSuggestions = Array.isArray(suggestions) ? suggestions : [];
      const currentIssue = await getNormalizedIssueFn({
        issueKey,
        contextIssueKey,
      });
      const resolvedIssueKey = currentIssue.key;
      const results = new Array(normalizedSuggestions.length);
      const seenTargetGroups = new Set();
      const successfulBatchEntries = [];
      const workingIssue = {
        ...currentIssue,
      };
      let summaryTouched = false;
      let descriptionTouched = false;
      let acceptanceCriteriaTouched = false;

      for (const [resultIndex, suggestion] of normalizedSuggestions.entries()) {
        const auditId = createAuditId();
        const targetGroup = suggestion?.targetField;
        const isMergeableTargetGroup = MERGEABLE_TARGET_GROUPS.has(targetGroup);
        const isAdditionalMergeableSuggestion =
          isMergeableTargetGroup && seenTargetGroups.has(targetGroup);

        if (seenTargetGroups.has(targetGroup) && !isMergeableTargetGroup) {
          const error = buildFrontendError(
            'BATCH_TARGET_CONFLICT',
            'Mehrere Vorschläge im Batch würden dasselbe Feld ändern.'
          );

          await storeApplyAuditRecordFn(
            resolvedIssueKey,
            auditId,
            buildAuditRecord({
              auditId,
              issueKey: resolvedIssueKey,
              accountId,
              suggestion,
              status: 'failed',
              error,
            })
          );

          results[resultIndex] = buildApplyResult({
            issueKey: resolvedIssueKey,
            suggestion,
            status: 'failed',
            error,
            auditId,
          });
          continue;
        }

        const hasConflict = isAdditionalMergeableSuggestion
          ? (() => {
              const expectedCurrentText = normalizeText(suggestion?.currentText);

              if (!expectedCurrentText) {
                return false;
              }

              const originalText = normalizeText(currentIssue?.[targetGroup]);
              const latestWorkingText = normalizeText(workingIssue?.[targetGroup]);

              // Mehrere Vorschläge für dasselbe Feld in einem Batch können legitim entweder auf
              // die ursprüngliche Analyse-Baseline oder den aktuellen Batch-Arbeitstext verweisen.
              return (
                expectedCurrentText !== originalText && expectedCurrentText !== latestWorkingText
              );
            })()
          : detectConflict(workingIssue, suggestion);

        if (hasConflict) {
          const error = buildFrontendError(
            'ISSUE_CONFLICT',
            'Das Work Item wurde seit der Analyse verändert. Bitte die Analyse erneut ausführen.'
          );

          await storeApplyAuditRecordFn(
            resolvedIssueKey,
            auditId,
            buildAuditRecord({
              auditId,
              issueKey: resolvedIssueKey,
              accountId,
              suggestion,
              status: 'failed',
              error,
            })
          );

          results[resultIndex] = buildApplyResult({
            issueKey: resolvedIssueKey,
            suggestion,
            status: 'failed',
            error,
            auditId,
          });
          continue;
        }

        seenTargetGroups.add(targetGroup);
        successfulBatchEntries.push({
          resultIndex,
          suggestion,
          auditId,
        });

        if (suggestion?.targetField === 'summary') {
          workingIssue.summary = normalizeText(suggestion?.suggestedText);
          summaryTouched = true;
        } else if (suggestion?.targetField === 'description') {
          workingIssue.description = buildRevisedDescription(
            workingIssue.description ?? '',
            suggestion?.suggestedText ?? ''
          );
          descriptionTouched = true;
        } else if (suggestion?.targetField === 'acceptanceCriteria') {
          workingIssue.acceptanceCriteria = normalizeText(suggestion?.suggestedText);
          acceptanceCriteriaTouched = true;
        }
      }

      if (successfulBatchEntries.length > 0) {
        // Das Feld-Payload einmal aus dem akkumulierten workingIssue aufbauen, damit mehrere
        // Vorschläge für dasselbe Feld (z. B. zwei Beschreibungsrevisionen) zusammengeführt statt
        // überschrieben werden. Jedes Update unabhängig vom originalen currentIssue abzuleiten
        // würde das letzte Schreiben gewinnen lassen und frühere Änderungen still verwerfen.
        const fields = {};

        if (summaryTouched) {
          fields.summary = normalizeText(workingIssue.summary);
        }

        if (descriptionTouched) {
          fields.description = buildHtmlDocument(normalizeText(workingIssue.description ?? ''));
        }

        if (acceptanceCriteriaTouched) {
          fields.acceptanceCriteria = buildHtmlDocument(
            normalizeText(workingIssue.acceptanceCriteria ?? '')
          );
        }

        try {
          await updateIssueFieldsFn(resolvedIssueKey, fields);

          for (const { resultIndex, suggestion, auditId } of successfulBatchEntries) {
            await storeApplyAuditRecordFn(
              resolvedIssueKey,
              auditId,
              buildAuditRecord({
                auditId,
                issueKey: resolvedIssueKey,
                accountId,
                suggestion,
                status: 'completed',
                })
            );

            results[resultIndex] = buildApplyResult({
              issueKey: resolvedIssueKey,
              suggestion,
              status: 'completed',
              auditId,
            });
          }
        } catch (error) {
          const frontendError = buildFrontendError(
            'WORK_ITEM_UPDATE_FAILED',
            error instanceof Error ? error.message : 'Work-Item-Aktualisierung unerwartet fehlgeschlagen.'
          );

          for (const { resultIndex, suggestion, auditId } of successfulBatchEntries) {
            await storeApplyAuditRecordFn(
              resolvedIssueKey,
              auditId,
              buildAuditRecord({
                auditId,
                issueKey: resolvedIssueKey,
                accountId,
                suggestion,
                status: 'failed',
                error: frontendError,
              })
            );

            results[resultIndex] = buildApplyResult({
              issueKey: resolvedIssueKey,
              suggestion,
              status: 'failed',
              error: frontendError,
              auditId,
            });
          }
        }
      }

      const orderedResults = results.filter(Boolean);

      return {
        issueKey: resolvedIssueKey,
        results: orderedResults,
        summary: {
          requested: normalizedSuggestions.length,
          succeeded: orderedResults.filter(entry => entry.status === 'completed').length,
          failed: orderedResults.filter(entry => entry.status === 'failed').length,
        },
      };
    },
  };
}

export const __testUtils = {
  buildHtmlDocument,
  buildRevisedDescription,
};
