import { app } from '@azure/functions';

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => {
    return {
      jsonBody: {
        status: 'ok',
        service: 'azure-boards-quality-gate',
      },
    };
  },
});
