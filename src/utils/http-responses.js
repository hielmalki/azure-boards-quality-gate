// Kleine, von allen Endpunkten in src/functions/ geteilte Helfer (Schritt 6):
// JSON-Body lesen und Fehler auf HTTP-Antworten abbilden. Vermeidet, dass
// dieselbe try/catch-/Statuscode-Logik in ~25 Handlern dupliziert wird.

export function errorResponse(status, code, message) {
  return {
    status,
    jsonBody: {
      error: { code, message },
    },
  };
}

export async function readJsonBody(request) {
  try {
    return (await request.json()) ?? {};
  } catch {
    return {};
  }
}

// FORBIDDEN (assertAdmin) und UNAUTHENTICATED (withAuth) tragen bereits einen
// `code` am Error-Objekt; alle anderen Service-Fehler werden als Gateway-
// Fehler gegenüber Azure DevOps behandelt (analog zum bestehenden
// WORK_ITEM_FETCH_FAILED-Muster in get-work-item.js).
export function mapErrorToResponse(error, { fallbackCode = 'REQUEST_FAILED', fallbackStatus = 502 } = {}) {
  if (error?.code === 'FORBIDDEN') {
    return errorResponse(403, 'FORBIDDEN', error.message);
  }

  if (error?.code === 'UNAUTHENTICATED') {
    return errorResponse(401, 'UNAUTHENTICATED', error.message);
  }

  return errorResponse(
    fallbackStatus,
    fallbackCode,
    error instanceof Error ? error.message : 'Unerwarteter Fehler.'
  );
}
