import test from 'node:test';
import assert from 'node:assert/strict';
import { __testUtils } from '../src/functions/work-items.js';
import { fakeRequest, fakeContext, installFetchRouter, profileRoute } from './helpers/http-test-utils.js';

process.env.AZURE_DEVOPS_ORG_URL = 'https://dev.azure.com/test-org';
process.env.AZURE_DEVOPS_PROJECT = 'QualityGate';
process.env.AZURE_DEVOPS_PAT = 'fake-pat-value';

const {
  getWorkItemHandler,
  analyzeWorkItemHandler,
  applyWorkItemFixHandler,
  applyWorkItemBatchFixHandler,
  checkWorkItemDuplicatesHandler,
} = __testUtils;

test('every work-items handler returns 401 without an Authorization header', async () => {
  const handlers = [
    getWorkItemHandler,
    analyzeWorkItemHandler,
    applyWorkItemFixHandler,
    applyWorkItemBatchFixHandler,
    checkWorkItemDuplicatesHandler,
  ];

  for (const handler of handlers) {
    const response = await handler(fakeRequest({ token: null, params: { id: '42' } }), fakeContext());
    assert.equal(response.status, 401);
    assert.equal(response.jsonBody.error.code, 'UNAUTHENTICATED');
  }
});

test('getWorkItem returns the normalized issue on success', async () => {
  const restoreFetch = installFetchRouter([
    profileRoute(),
    {
      test: url => url.includes('/_apis/wit/workitems/42'),
      respond: async () => ({
        ok: true,
        json: async () => ({ id: 42, fields: { 'System.Title': 'Titel' } }),
      }),
    },
  ]);

  try {
    const response = await getWorkItemHandler(fakeRequest({ params: { id: '42' } }), fakeContext());
    assert.equal(response.jsonBody.key, '42');
    assert.equal(response.jsonBody.summary, 'Titel');
  } finally {
    restoreFetch();
  }
});

test('getWorkItem maps a gateway failure to a 502 WORK_ITEM_FETCH_FAILED response', async () => {
  const restoreFetch = installFetchRouter([
    profileRoute(),
    {
      test: url => url.includes('/_apis/wit/workitems/999'),
      respond: async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => '' }),
    },
  ]);

  try {
    const response = await getWorkItemHandler(fakeRequest({ params: { id: '999' } }), fakeContext());
    assert.equal(response.status, 502);
    assert.equal(response.jsonBody.error.code, 'WORK_ITEM_FETCH_FAILED');
  } finally {
    restoreFetch();
  }
});

test('checkWorkItemDuplicates returns candidates on success', async () => {
  const restoreFetch = installFetchRouter([
    profileRoute(),
    {
      test: url => url.includes('/_apis/wit/wiql'),
      respond: async () => ({ ok: true, json: async () => ({ workItems: [{ id: 7 }] }) }),
    },
    {
      test: url => url.includes('/_apis/wit/workitems?'),
      respond: async () => ({
        ok: true,
        json: async () => ({ value: [{ id: 7, fields: { 'System.Title': 'Ähnliches Ticket', 'System.State': 'New' } }] }),
      }),
    },
  ]);

  try {
    const response = await checkWorkItemDuplicatesHandler(
      fakeRequest({
        params: { id: '42' },
        jsonBody: { summary: 'Kontingent für Nutzerbalance verwalten', projectKey: 'QualityGate' },
      }),
      fakeContext()
    );

    assert.equal(response.jsonBody.skipped, false);
    assert.equal(response.jsonBody.candidates.length, 1);
    assert.equal(response.jsonBody.candidates[0].key, '7');
  } finally {
    restoreFetch();
  }
});
