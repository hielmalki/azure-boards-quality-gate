import { AsyncLocalStorage } from 'node:async_hooks';

// Request-scoped Auth-Kontext (SDK-Token + aufgelöste Identität). Läuft über
// AsyncLocalStorage, damit Gateway und Services das Token nicht als expliziten
// Parameter durchreichen müssen (Schritt 3, siehe docs/azure-boards-migration-
// architektur.md, §„Auth- & Berechtigungsmodell"). Außerhalb eines Requests
// (Tests, `func start` ohne Token) liefert getAuthContext() undefined, sodass
// bestehende Aufrufer unverändert funktionieren.

const authContextStorage = new AsyncLocalStorage();

export async function runWithAuthContext(context, fn) {
  return authContextStorage.run(context, fn);
}

export function getAuthContext() {
  return authContextStorage.getStore();
}
