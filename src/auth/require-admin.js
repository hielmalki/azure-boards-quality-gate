import { getAuthContext } from './auth-context.js';
import { logError } from '../utils/logger.js';

const API_VERSION = '7.1';

// Security-Namespace „Project" in Azure DevOps (Microsoft-Doku „Security
// namespace and permission reference"). GENERIC_WRITE (Bit 2) deckt das
// Bearbeiten projektweiter Einstellungen ab und dient hier als Mindest-
// Berechtigung für Admin-Aktionen (Rulesets, API-Key) — Ersatz für Forges
// `mypermissions?permissions=ADMINISTER`.
//
// WICHTIG: Namespace-ID und Bit-Wert hängen vom Prozess-Template/den
// Sicherheitseinstellungen der Ziel-Organisation ab (siehe „Wichtiger
// Vorbehalt: Prozess-Template" in docs/azure-boards-migration-architektur.md).
// Vor Produktivbetrieb mit `GET _apis/securitynamespaces/{id}` gegen die
// Zielorganisation verifizieren und bei Bedarf über die Env-Variablen
// `ADO_ADMIN_SECURITY_NAMESPACE_ID` / `ADO_ADMIN_PERMISSION_BITMASK`
// überschreiben.
const DEFAULT_SECURITY_NAMESPACE_ID = '52d39943-cb85-4d7f-8fa8-c6baac873819';
const DEFAULT_PERMISSION_BITMASK = 2;

function getPermissionCheckConfig() {
  return {
    securityNamespaceId: process.env.ADO_ADMIN_SECURITY_NAMESPACE_ID || DEFAULT_SECURITY_NAMESPACE_ID,
    permissionBitmask: Number(process.env.ADO_ADMIN_PERMISSION_BITMASK) || DEFAULT_PERMISSION_BITMASK,
  };
}

function forbiddenError(message) {
  const error = new Error(message);
  error.code = 'FORBIDDEN';
  return error;
}

// fail-closed (bewusste Abkehr von Forges fail-open-`assertAdmin`): jede
// Unklarheit — fehlender Auth-Kontext, Netzwerkfehler, unerwartete Antwort —
// führt zur Ablehnung der Aktion, nie zur stillschweigenden Erlaubnis.
export async function assertAdmin({ fetchFn = globalThis.fetch } = {}) {
  const authContext = getAuthContext();

  if (!authContext?.token || !authContext?.orgUrl) {
    throw forbiddenError('Diese Aktion erfordert Azure-DevOps-Administratorrechte.');
  }

  const { securityNamespaceId, permissionBitmask } = getPermissionCheckConfig();
  const url = new URL(
    `${authContext.orgUrl.replace(/\/+$/, '')}/_apis/permissions/${securityNamespaceId}/${permissionBitmask}`
  );
  url.searchParams.set('api-version', API_VERSION);

  let hasPermission = false;

  try {
    const response = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${authContext.token}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`permissions endpoint returned ${response.status}`);
    }

    const data = await response.json().catch(() => null);
    hasPermission = data?.value === true;
  } catch (error) {
    logError('auth.admin_check_failed', error);
    throw forbiddenError('Diese Aktion erfordert Azure-DevOps-Administratorrechte.');
  }

  if (!hasPermission) {
    throw forbiddenError('Diese Aktion erfordert Azure-DevOps-Administratorrechte.');
  }
}
