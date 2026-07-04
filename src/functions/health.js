import { app } from '@azure/functions';
import { withCors } from '../utils/cors.js';

app.http('health', {
  methods: ['GET', 'OPTIONS'],
  authLevel: 'anonymous',
  route: 'health',
  handler: withCors(async () => {
    return {
      jsonBody: {
        status: 'ok',
        service: 'azure-boards-quality-gate',
      },
    };
  }),
});
