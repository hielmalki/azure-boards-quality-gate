// Extraktion und Validierung des ADO-SDK-Access-Tokens (Schritt 3, Token-
// Passthrough-Modell, siehe Plan „Auth-Modell"). Das Frontend schickt das über
// `SDK.getAccessToken()` gewonnene Token als `Authorization: Bearer <token>`;
// dieses Modul liest es aus und löst die stabile ADO-Nutzeridentität auf
// (Ersatz für Forges `context.accountId`).

const PROFILE_API_URL = 'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1';

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
  const response = await fetchFn(PROFILE_API_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve Azure DevOps identity: ${response.status} ${response.statusText}`);
  }

  const profile = await response.json();

  if (!profile?.id) {
    throw new Error('Azure DevOps profile response did not include an id.');
  }

  return profile.id;
}
