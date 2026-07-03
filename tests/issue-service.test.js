import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/services/issue-service.js';

const { normalizeIssuePayload } = __testUtils;

function createRawIssue(fields = {}) {
  return {
    id: '42',
    key: 'KAN-42',
    fields: {
      summary: 'Provider implementieren',
      ...fields,
    },
  };
}

test('normalizeIssuePayload converts an HTML description into normalized plain text', () => {
  const issue = normalizeIssuePayload(
    createRawIssue({
      description:
        '<p>Erster Absatz mit <a href="https://example.com">Link</a>.</p>' +
        '<ul><li>Punkt eins</li><li>Punkt zwei</li></ul>',
    })
  );

  assert.equal(issue.description, 'Erster Absatz mit Link.\n\n- Punkt eins\n- Punkt zwei');
  assert.equal(issue.fieldAvailability.hasDescription, true);
});

test('normalizeIssuePayload reads acceptance criteria from the native ADO field as HTML', () => {
  const issue = normalizeIssuePayload(
    createRawIssue({
      'Microsoft.VSTS.Common.AcceptanceCriteria':
        '<ol><li>Erstes Kriterium</li><li>Zweites Kriterium</li></ol>',
    })
  );

  assert.equal(issue.acceptanceCriteria, '1. Erstes Kriterium\n2. Zweites Kriterium');
  assert.equal(issue.fieldAvailability.hasAcceptanceCriteria, true);
});

test('normalizeIssuePayload treats an empty or missing acceptance criteria field as absent', () => {
  const withoutField = normalizeIssuePayload(createRawIssue());
  assert.equal(withoutField.acceptanceCriteria, null);
  assert.equal(withoutField.fieldAvailability.hasAcceptanceCriteria, false);

  const withBlankField = normalizeIssuePayload(
    createRawIssue({ 'Microsoft.VSTS.Common.AcceptanceCriteria': '<p></p>' })
  );
  assert.equal(withBlankField.acceptanceCriteria, null);
  assert.equal(withBlankField.fieldAvailability.hasAcceptanceCriteria, false);
});

test('normalizeIssuePayload collapses excessive blank lines from HTML block spacing', () => {
  const issue = normalizeIssuePayload(
    createRawIssue({
      description: '<p>Absatz eins</p><p></p><p></p><p>Absatz zwei</p>',
    })
  );

  assert.equal(issue.description, 'Absatz eins\n\nAbsatz zwei');
});
