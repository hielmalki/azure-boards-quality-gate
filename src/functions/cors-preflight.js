import { app } from '@azure/functions';
import { corsHeaders } from '../utils/cors.js';

// Ein einziger Preflight-Handler für alle Routen. OPTIONS darf NICHT pro Route
// registriert werden, da mehrere Funktionen sich eine Route teilen (nur nach
// HTTP-Methode unterschieden) — mehrfach registriertes OPTIONS auf derselben
// Route führt zu Routenkonflikten und verhindert das Hochfahren des Hosts.
app.http('corsPreflight', {
  methods: ['OPTIONS'],
  authLevel: 'anonymous',
  route: '{*path}',
  handler: async () => ({
    status: 204,
    headers: corsHeaders(),
  }),
});
