import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateCandidates } from '../src/services/duplicate-check-service.js';

test('findDuplicateCandidates skips (without querying Azure DevOps) when there are too few keywords', async () => {
  const result = await findDuplicateCandidates(
    { issueKey: '42', summary: 'fix', projectKey: 'QualityGate' },
    {
      searchDuplicateCandidatesFn: async () => {
        throw new Error('should not be called');
      },
    }
  );

  assert.equal(result.skipped, true);
  assert.equal(result.error, null);
  assert.deepEqual(result.candidates, []);
});

test('findDuplicateCandidates skips (without querying Azure DevOps) when the work item id is not numeric', async () => {
  const result = await findDuplicateCandidates(
    { issueKey: 'KAN-42', summary: 'Search filter performance regression', projectKey: 'QualityGate' },
    {
      searchDuplicateCandidatesFn: async () => {
        throw new Error('should not be called');
      },
    }
  );

  assert.equal(result.skipped, true);
  assert.equal(result.error, null);
});

test('findDuplicateCandidates maps gateway results into the candidate shape', async () => {
  const searchCalls = [];
  const result = await findDuplicateCandidates(
    { issueKey: '42', summary: 'Search filter performance regression', projectKey: 'QualityGate' },
    {
      searchDuplicateCandidatesFn: async params => {
        searchCalls.push(params);
        return [
          { id: '7', title: 'Filter performance issue', state: 'Active', stateCategory: 'In Progress' },
        ];
      },
    }
  );

  assert.equal(searchCalls.length, 1);
  assert.equal(searchCalls[0].workItemId, '42');
  assert.equal(searchCalls[0].project, 'QualityGate');
  assert.ok(searchCalls[0].keywords.length >= 2);

  assert.equal(result.skipped, false);
  assert.equal(result.error, null);
  assert.deepEqual(result.candidates, [
    { key: '7', summary: 'Filter performance issue', status: 'Active', statusCategory: 'In Progress' },
  ]);
});

test('findDuplicateCandidates returns a soft error when the gateway call fails', async () => {
  const result = await findDuplicateCandidates(
    { issueKey: '42', summary: 'Search filter performance regression', projectKey: 'QualityGate' },
    {
      searchDuplicateCandidatesFn: async () => {
        throw new Error('Azure DevOps WIQL search failed: 500 Internal Server Error');
      },
    }
  );

  assert.equal(result.skipped, false);
  assert.deepEqual(result.candidates, []);
  assert.match(result.error, /WIQL search failed/);
});
