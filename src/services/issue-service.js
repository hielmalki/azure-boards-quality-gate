import { convert } from 'html-to-text';
import {
  ACCEPTANCE_CRITERIA_FIELD_KEY,
  fetchIssueForAnalysis,
} from '../gateways/azure-devops/work-item-gateway.js';

const HTML_TO_TEXT_OPTIONS = {
  wordwrap: false,
  selectors: [
    { selector: 'a', options: { ignoreHref: true } },
    { selector: 'ul', options: { itemPrefix: '- ' } },
  ],
};

function asNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) {
    return [];
  }

  return labels
    .filter(label => typeof label === 'string' && label.trim().length > 0)
    .map(label => label.trim());
}

function normalizeHtmlField(html) {
  if (typeof html !== 'string' || html.trim().length === 0) {
    return null;
  }

  const text = convert(html, HTML_TO_TEXT_OPTIONS)
    // html-to-text rendert nummerierte Listenpunkte mit einem führenden Ausrichtungs-
    // leerzeichen (" 1. …"); das entfernen wir, damit /^\d+\.\s+/-Musterabgleiche
    // andernorts im Code zeilenweise ohne zusätzliches Trimmen funktionieren.
    .replace(/^ (?=\d+\.\s)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 0 ? text : null;
}

function normalizeIssueType(issueType) {
  if (!issueType || typeof issueType !== 'object') {
    return {
      id: null,
      name: null,
    };
  }

  return {
    id: asNonEmptyString(issueType.id),
    name: asNonEmptyString(issueType.name),
  };
}

function normalizePriority(priority) {
  if (!priority || typeof priority !== 'object') {
    return {
      id: null,
      name: null,
    };
  }

  return {
    id: asNonEmptyString(priority.id),
    name: asNonEmptyString(priority.name),
  };
}

function normalizeEstimate(fields) {
  const estimateSeconds = [
    fields?.timeoriginalestimate,
    fields?.aggregatetimeoriginalestimate,
  ].find(value => Number.isFinite(value) && value > 0) ?? null;

  const originalEstimate = asNonEmptyString(fields?.timetracking?.originalEstimate);

  return {
    seconds: estimateSeconds,
    display: originalEstimate,
    source: estimateSeconds || originalEstimate ? 'jira-native' : null,
  };
}

function normalizeStatus(status) {
  if (!status || typeof status !== 'object') {
    return {
      id: null,
      name: null,
      category: null,
    };
  }

  return {
    id: asNonEmptyString(status.id),
    name: asNonEmptyString(status.name),
    category: asNonEmptyString(status.statusCategory?.name),
  };
}

function buildFieldAvailability(fields) {
  return {
    hasSummary: Boolean(asNonEmptyString(fields?.summary)),
    hasDescription: Boolean(normalizeHtmlField(fields?.description)),
    hasAcceptanceCriteria: Boolean(
      normalizeHtmlField(fields?.[ACCEPTANCE_CRITERIA_FIELD_KEY])
    ),
    hasIssueType: Boolean(asNonEmptyString(fields?.issuetype?.name)),
    hasPriority: Boolean(asNonEmptyString(fields?.priority?.name)),
    hasLabels: normalizeLabels(fields?.labels).length > 0,
    hasStatus: Boolean(asNonEmptyString(fields?.status?.name)),
  };
}

function normalizeIssuePayload(issue) {
  const fields = issue?.fields ?? {};

  return {
    issueId: asNonEmptyString(issue?.id),
    key: asNonEmptyString(issue?.key),
    summary: asNonEmptyString(fields.summary),
    description: normalizeHtmlField(fields.description),
    acceptanceCriteria: normalizeHtmlField(fields[ACCEPTANCE_CRITERIA_FIELD_KEY]),
    issueType: normalizeIssueType(fields.issuetype),
    priority: normalizePriority(fields.priority),
    labels: normalizeLabels(fields.labels),
    status: normalizeStatus(fields.status),
    estimate: normalizeEstimate(fields),
    fieldAvailability: buildFieldAvailability(fields),
  };
}

function resolveIssueKey(requestIssueKey, contextIssueKey) {
  return asNonEmptyString(requestIssueKey) ?? asNonEmptyString(contextIssueKey);
}

export async function getNormalizedIssue({ issueKey, contextIssueKey }) {
  const resolvedIssueKey = resolveIssueKey(issueKey, contextIssueKey);

  if (!resolvedIssueKey) {
    throw new Error('Issue key is required to load a normalized Jira issue.');
  }

  const rawIssue = await fetchIssueForAnalysis(resolvedIssueKey);
  return normalizeIssuePayload(rawIssue);
}

export const __testUtils = {
  normalizeIssuePayload,
};
