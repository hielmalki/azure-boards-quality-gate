import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchIssueForAnalysis,
  updateIssueFields,
  searchDuplicateCandidates,
  fetchLinkedTestCases,
  fetchTestCaseSteps,
  updateTestCaseSteps,
  parseStepsXml,
  isSafeWorkItemId,
  ACCEPTANCE_CRITERIA_FIELD_KEY,
} from '../src/gateways/azure-devops/work-item-gateway.js';
import { runWithAuthContext } from '../src/auth/auth-context.js';

process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test-org';
process.env.AZURE_DEVOPS_PROJECT = 'QualityGate';
process.env.AZURE_DEVOPS_PAT = 'fake-pat-value';

function jsonResponse(body, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return {
    ok,
    status,
    statusText,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function createFetchStub(responses) {
  const calls = [];
  const queue = [...responses];
  const fetchFn = async (url, init) => {
    calls.push({ url: url.toString(), init });
    const next = queue.shift();
    if (!next) {
      throw new Error('No more stubbed responses configured');
    }
    return next;
  };
  return { fetchFn, calls };
}

test('isSafeWorkItemId accepts only plain numeric ids', () => {
  assert.equal(isSafeWorkItemId('42'), true);
  assert.equal(isSafeWorkItemId('0'), true);
  assert.equal(isSafeWorkItemId(''), false);
  assert.equal(isSafeWorkItemId('42; DROP'), false);
  assert.equal(isSafeWorkItemId('KAN-42'), false);
  assert.equal(isSafeWorkItemId(null), false);
  assert.equal(isSafeWorkItemId(42), false);
});

test('fetchIssueForAnalysis translates an Azure DevOps work item into the Jira-shaped payload', async () => {
  const { fetchFn, calls } = createFetchStub([
    jsonResponse({
      id: 42,
      fields: {
        'System.Title': 'Provider implementieren',
        'System.Description': '<p>Beschreibung</p>',
        'System.WorkItemType': 'User Story',
        'Microsoft.VSTS.Common.Priority': 2,
        'System.Tags': 'backend; llm',
        'System.State': 'Active',
        'Microsoft.VSTS.Scheduling.OriginalEstimate': 4,
        [ACCEPTANCE_CRITERIA_FIELD_KEY]: '<ol><li>Ein Kriterium</li></ol>',
      },
    }),
  ]);

  const issue = await fetchIssueForAnalysis('42', { fetchFn });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/_apis\/wit\/workitems\/42\?/);
  assert.equal(calls[0].init.headers.Authorization.startsWith('Basic '), true);

  assert.equal(issue.id, '42');
  assert.equal(issue.key, '42');
  assert.equal(issue.fields.summary, 'Provider implementieren');
  assert.equal(issue.fields.description, '<p>Beschreibung</p>');
  assert.equal(issue.fields[ACCEPTANCE_CRITERIA_FIELD_KEY], '<ol><li>Ein Kriterium</li></ol>');
  assert.equal(issue.fields.issuetype.name, 'User Story');
  assert.equal(issue.fields.priority.name, 'High');
  assert.deepEqual(issue.fields.labels, ['backend', 'llm']);
  assert.equal(issue.fields.status.name, 'Active');
  assert.equal(issue.fields.status.statusCategory.name, 'In Progress');
  assert.equal(issue.fields.timeoriginalestimate, 4 * 3600);
});

test('fetchIssueForAnalysis uses the request Bearer token from the auth context when present', async () => {
  const { fetchFn, calls } = createFetchStub([
    jsonResponse({ id: 42, fields: { 'System.Title': 'Titel' } }),
  ]);

  await runWithAuthContext({ token: 'sdk-access-token' }, () =>
    fetchIssueForAnalysis('42', { fetchFn })
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer sdk-access-token');
});

test('fetchIssueForAnalysis falls back to the PAT when there is no auth context', async () => {
  const { fetchFn, calls } = createFetchStub([
    jsonResponse({ id: 42, fields: { 'System.Title': 'Titel' } }),
  ]);

  await fetchIssueForAnalysis('42', { fetchFn });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers.Authorization.startsWith('Basic '), true);
});

test('fetchIssueForAnalysis throws a descriptive error on a non-ok response', async () => {
  const { fetchFn } = createFetchStub([
    { ok: false, status: 404, statusText: 'Not Found', text: async () => '' },
  ]);

  await assert.rejects(
    () => fetchIssueForAnalysis('999', { fetchFn }),
    /Failed to load Azure DevOps work item 999: 404 Not Found/
  );
});

test('updateIssueFields sends a json-patch+json PATCH request with mapped field paths', async () => {
  const { fetchFn, calls } = createFetchStub([jsonResponse({})]);

  await updateIssueFields(
    '42',
    { summary: 'Neuer Titel', acceptanceCriteria: '<ol><li>Kriterium</li></ol>' },
    { fetchFn }
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/_apis\/wit\/workitems\/42\?/);
  assert.equal(calls[0].init.method, 'PATCH');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json-patch+json');

  const patchDocument = JSON.parse(calls[0].init.body);
  assert.deepEqual(patchDocument, [
    { op: 'add', path: '/fields/System.Title', value: 'Neuer Titel' },
    {
      op: 'add',
      path: `/fields/${ACCEPTANCE_CRITERIA_FIELD_KEY}`,
      value: '<ol><li>Kriterium</li></ol>',
    },
  ]);
});

test('updateIssueFields does not call fetch when no recognized fields are provided', async () => {
  const { fetchFn, calls } = createFetchStub([]);

  await updateIssueFields('42', { unknownField: 'value' }, { fetchFn });

  assert.equal(calls.length, 0);
});

test('updateIssueFields throws a descriptive error including the response body on failure', async () => {
  const { fetchFn } = createFetchStub([
    { ok: false, status: 400, statusText: 'Bad Request', text: async () => '{"message":"invalid"}' },
  ]);

  await assert.rejects(
    () => updateIssueFields('42', { summary: 'x' }, { fetchFn }),
    /Failed to update Azure DevOps work item 42: 400 Bad Request - \{"message":"invalid"\}/
  );
});

test('searchDuplicateCandidates returns an empty list without calling fetch when there are no keywords', async () => {
  const { fetchFn, calls } = createFetchStub([]);

  const candidates = await searchDuplicateCandidates(
    { workItemId: '42', keywords: [], project: 'QualityGate' },
    { fetchFn }
  );

  assert.deepEqual(candidates, []);
  assert.equal(calls.length, 0);
});

test('searchDuplicateCandidates runs a WIQL search then batch-reads title/state for the matches', async () => {
  const { fetchFn, calls } = createFetchStub([
    jsonResponse({
      workItems: [{ id: 7 }, { id: 8 }],
    }),
    jsonResponse({
      value: [
        { id: 7, fields: { 'System.Title': 'Ähnliches Ticket A', 'System.State': 'New' } },
        { id: 8, fields: { 'System.Title': 'Ähnliches Ticket B', 'System.State': 'Closed' } },
      ],
    }),
  ]);

  const candidates = await searchDuplicateCandidates(
    { workItemId: '42', keywords: ['balance', 'kontingent'], project: 'QualityGate' },
    { fetchFn }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/_apis\/wit\/wiql\?/);
  assert.equal(calls[0].init.method, 'POST');

  const wiqlBody = JSON.parse(calls[0].init.body);
  assert.match(wiqlBody.query, /\[System\.Title\] CONTAINS 'balance'/);
  assert.match(wiqlBody.query, /\[System\.Title\] CONTAINS 'kontingent'/);
  assert.match(wiqlBody.query, /\[System\.Id\] <> 42/);
  assert.match(wiqlBody.query, /\[System\.TeamProject\] = 'QualityGate'/);

  assert.match(calls[1].url, /\/_apis\/wit\/workitems\?/);
  assert.match(calls[1].url, /ids=7%2C8/);

  assert.deepEqual(candidates, [
    { id: '7', title: 'Ähnliches Ticket A', state: 'New', stateCategory: 'To Do' },
    { id: '8', title: 'Ähnliches Ticket B', state: 'Closed', stateCategory: 'Done' },
  ]);
});

test('searchDuplicateCandidates escapes single quotes in keywords and project name for WIQL safety', async () => {
  const { fetchFn, calls } = createFetchStub([
    jsonResponse({ workItems: [] }),
  ]);

  await searchDuplicateCandidates(
    { workItemId: '42', keywords: ["user's balance"], project: "O'Brien Project" },
    { fetchFn }
  );

  const wiqlBody = JSON.parse(calls[0].init.body);
  assert.match(wiqlBody.query, /user''s balance/);
  assert.match(wiqlBody.query, /O''Brien Project/);
});

test('searchDuplicateCandidates returns an empty list when the WIQL search has no matches', async () => {
  const { fetchFn, calls } = createFetchStub([jsonResponse({ workItems: [] })]);

  const candidates = await searchDuplicateCandidates(
    { workItemId: '42', keywords: ['balance'], project: 'QualityGate' },
    { fetchFn }
  );

  assert.deepEqual(candidates, []);
  assert.equal(calls.length, 1);
});

test('parseStepsXml extracts action/expected pairs and unescapes entities', () => {
  const xml =
    '<steps id="0" last="2">' +
    '<step id="1" type="ActionStep"><parameterizedString isformatted="true">Eingabe &lt;script&gt; &amp; Test</parameterizedString><parameterizedString isformatted="true">Ergebnis &gt; erwartet</parameterizedString></step>' +
    '<step id="2" type="ActionStep"><parameterizedString isformatted="true">Zweiter Schritt</parameterizedString><parameterizedString isformatted="true">Zweites Ergebnis</parameterizedString></step>' +
    '</steps>';

  const steps = parseStepsXml(xml);

  assert.deepEqual(steps, [
    { action: 'Eingabe <script> & Test', expected: 'Ergebnis > erwartet' },
    { action: 'Zweiter Schritt', expected: 'Zweites Ergebnis' },
  ]);
});

test('parseStepsXml returns an empty list for empty or unparsable input', () => {
  assert.deepEqual(parseStepsXml(''), []);
  assert.deepEqual(parseStepsXml(null), []);
  assert.deepEqual(parseStepsXml('not xml at all'), []);
});

test('fetchLinkedTestCases returns an empty list when there is no TestedBy relation', async () => {
  const { fetchFn, calls } = createFetchStub([
    jsonResponse({ id: 42, relations: [{ rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/test-org/_apis/wit/workItems/99' }] }),
  ]);

  const testCases = await fetchLinkedTestCases({ workItemId: '42' }, { fetchFn });

  assert.deepEqual(testCases, []);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /%24expand=relations/);
});

test('fetchLinkedTestCases filters TestedBy-Forward ("Tested By") relations and batch-reads title/steps/state', async () => {
  const { fetchFn, calls } = createFetchStub([
    jsonResponse({
      id: 42,
      relations: [
        { rel: 'System.LinkTypes.Related', url: 'https://dev.azure.com/test-org/_apis/wit/workItems/99' },
        {
          rel: 'Microsoft.VSTS.Common.TestedBy-Forward',
          url: 'https://dev.azure.com/test-org/_apis/wit/workItems/501',
        },
      ],
    }),
    jsonResponse({
      value: [
        {
          id: 501,
          fields: {
            'System.Title': 'Login mit gültigen Daten',
            'System.State': 'Design',
            'Microsoft.VSTS.TCM.Steps':
              '<steps id="0" last="1"><step id="1" type="ActionStep"><parameterizedString isformatted="true">Login ausführen</parameterizedString><parameterizedString isformatted="true">Dashboard erscheint</parameterizedString></step></steps>',
          },
        },
      ],
    }),
  ]);

  const testCases = await fetchLinkedTestCases({ workItemId: '42' }, { fetchFn });

  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /ids=501/);
  assert.deepEqual(testCases, [
    {
      id: '501',
      title: 'Login mit gültigen Daten',
      state: 'Design',
      steps: [{ action: 'Login ausführen', expected: 'Dashboard erscheint' }],
    },
  ]);
});

test('fetchTestCaseSteps reads title and steps of a single test case by id', async () => {
  const { fetchFn, calls } = createFetchStub([
    jsonResponse({
      id: 501,
      fields: {
        'System.Title': 'Login mit gültigen Daten',
        'Microsoft.VSTS.TCM.Steps':
          '<steps id="0" last="1"><step id="1" type="ActionStep"><parameterizedString isformatted="true">Login ausführen</parameterizedString><parameterizedString isformatted="true">Dashboard erscheint</parameterizedString></step></steps>',
      },
    }),
  ]);

  const result = await fetchTestCaseSteps('501', { fetchFn });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/_apis\/wit\/workitems\/501\?/);
  assert.deepEqual(result, {
    id: '501',
    title: 'Login mit gültigen Daten',
    steps: [{ action: 'Login ausführen', expected: 'Dashboard erscheint' }],
  });
});

test('fetchTestCaseSteps throws a descriptive error on a non-ok response', async () => {
  const { fetchFn } = createFetchStub([
    { ok: false, status: 404, statusText: 'Not Found', text: async () => '' },
  ]);

  await assert.rejects(
    () => fetchTestCaseSteps('999', { fetchFn }),
    /Failed to load Azure DevOps test case 999: 404 Not Found/
  );
});

test('updateTestCaseSteps PATCHes only the Steps field with the given XML', async () => {
  const { fetchFn, calls } = createFetchStub([jsonResponse({})]);

  await updateTestCaseSteps('501', '<steps id="0" last="1"></steps>', { fetchFn });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/_apis\/wit\/workitems\/501\?/);
  assert.equal(calls[0].init.method, 'PATCH');
  assert.equal(calls[0].init.headers['Content-Type'], 'application/json-patch+json');

  const patchDocument = JSON.parse(calls[0].init.body);
  assert.deepEqual(patchDocument, [
    { op: 'add', path: '/fields/Microsoft.VSTS.TCM.Steps', value: '<steps id="0" last="1"></steps>' },
  ]);
});

test('updateTestCaseSteps throws a descriptive error including the response body on failure', async () => {
  const { fetchFn } = createFetchStub([
    { ok: false, status: 400, statusText: 'Bad Request', text: async () => '{"message":"invalid"}' },
  ]);

  await assert.rejects(
    () => updateTestCaseSteps('501', '<steps></steps>', { fetchFn }),
    /Failed to update Azure DevOps test case steps 501: 400 Bad Request - \{"message":"invalid"\}/
  );
});
