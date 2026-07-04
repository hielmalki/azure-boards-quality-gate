// Extraktion und Validierung des ADO-SDK-Access-Tokens (Schritt 3, Token-
// Passthrough-Modell, siehe Plan „Auth-Modell"). Das Frontend schickt das über
// `SDK.getAccessToken()` gewonnene Token als `Authorization: Bearer <token>`;
// dieses Modul liest es aus und löst die stabile ADO-Nutzeridentität auf
// (Ersatz für Forges `context.accountId`).
//
// `SDK.getAccessToken()` liefert ein Token, dessen Audience auf die
// Organisation beschränkt ist. Die globale, org-übergreifende Profile-API
// (app.vssps.visualstudio.com) lehnt ein solches Token ab (401) — deshalb wird
// hier bewusst derselbe org-scoped Endpunkt genutzt, den auch Gateway und
// Admin-Gate für dieses Token verwenden (`{orgUrl}/_apis/...`).

export function extractBearerToken(request) {
  const headerValue =
    typeof request?.headers?.get === 'function'
      ? request.headers.get('authorization')
      : request?.headers?.authorization ?? request?.headers?.Authorization;

  if (typeof headerValue !== 'string') {
    return null;
  }

  const match = /^Bearer\s+(.+)$/i.exec(headerValue.trim());
  return match ? match[1].trim() : null;
}

export async function resolveUserId(token, { fetchFn = globalThis.fetch } = {}) {
  const organizationUrl = process.env.AZURE_DEVOPS_ORG_URL;

  if (!organizationUrl) {
    throw new Error('Azure DevOps ist nicht konfiguriert. AZURE_DEVOPS_ORG_URL muss gesetzt sein.');
  }

  const url = new URL(`${organizationUrl.replace(/\/+$/, '')}/_apis/connectionData`);
  url.searchParams.set('connectOptions', 'none');
  url.searchParams.set('api-version', '7.1-preview.1');

  const response = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve Azure DevOps identity: ${response.status} ${response.statusText}`);
  }

  const connectionData = await response.json();
  const userId = connectionData?.authenticatedUser?.id;

  if (!userId) {
    throw new Error('Azure DevOps connectionData response did not include an authenticated user id.');
  }

  return userId;
}
