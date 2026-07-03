import { app } from '@azure/functions';
import { getNormalizedIssue } from '../services/issue-service.js';
import { logError, logInfo } from '../utils/logger.js';

app.http('getWorkItem', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'work-items/{id}',
  handler: async (request, context) => {
    const workItemId = request.params.id;

    try {
      const issue = await getNormalizedIssue({ issueKey: workItemId });

      logInfo('work_item.normalized', {
        workItemId: issue.key,
        hasDescription: issue.fieldAvailability.hasDescription,
        hasAcceptanceCriteria: issue.fieldAvailability.hasAcceptanceCriteria,
        hasPriority: issue.fieldAvailability.hasPriority,
        hasStatus: issue.fieldAvailability.hasStatus,
      });

      return { jsonBody: issue };
    } catch (error) {
      logError('work_item.normalize_failed', error, { requestedWorkItemId: workItemId });
      context.error(error);

      return {
        status: 502,
        jsonBody: {
          error: {
            code: 'WORK_ITEM_FETCH_FAILED',
            message: error instanceof Error ? error.message : 'Work item konnte nicht geladen werden.',
          },
        },
      };
    }
  },
});
