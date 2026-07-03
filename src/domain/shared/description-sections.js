/**
 * Shared description section utilities.
 *
 * These patterns and helpers identify preserved sections inside description
 * text (e.g. "Technische Notiz:"). Akzeptanzkriterien liegen in Azure Boards
 * in einem eigenen Feld (Microsoft.VSTS.Common.AcceptanceCriteria) und werden
 * daher nicht mehr als Beschreibungs-Abschnitt erkannt/bewahrt.
 * They are used by analysis, suggestion generation, and apply flows and must
 * stay in sync across all three.
 */

export const PRESERVED_DESCRIPTION_SECTION_PATTERNS = [
  /^technische notiz:?$/i,
  /^technical note:?$/i,
];

export function normalizeText(value) {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
}

export function isPreservedDescriptionSectionHeading(line) {
  const normalizedLine = normalizeText(line);
  return PRESERVED_DESCRIPTION_SECTION_PATTERNS.some(pattern => pattern.test(normalizedLine));
}

export function splitDescriptionSections(text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    return {
      mainBody: '',
      preservedSections: '',
    };
  }

  const lines = normalizedText.split('\n');
  const preservedSectionIndex = lines.findIndex(isPreservedDescriptionSectionHeading);

  if (preservedSectionIndex < 0) {
    return {
      mainBody: normalizedText,
      preservedSections: '',
    };
  }

  return {
    mainBody: normalizeText(lines.slice(0, preservedSectionIndex).join('\n')),
    preservedSections: normalizeText(lines.slice(preservedSectionIndex).join('\n')),
  };
}
