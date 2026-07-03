// Gemeinsame Test-Helfer für die Azure-Functions-Endpunkte in src/functions/
// (Schritt 6). Kein *.test.js-Suffix, daher nicht Teil der `npm test`-Glob.

export function fakeRequest({ token = 'valid-token', params = {}, query = {}, jsonBody = {} } = {}) {
  return {
    headers: {
      get(name) {
        return name.toLowerCase() === 'authorization' && token ? `Bearer ${token}` : null;
      },
    },
    params,
    query: {
      get(name) {
        return Object.prototype.hasOwnProperty.call(query, name) ? query[name] : null;
      },
    },
    json: async () => jsonBody,
  };
}

export function fakeContext() {
  return { error() {}, log() {} };
}

export function installFetchRouter(routes) {
  const original = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    const urlString = url.toString();
    const route = routes.find(candidate => candidate.test(urlString));

    if (!route) {
      throw new Error(`No stubbed fetch route configured for ${urlString}`);
    }

    return route.respond(urlString, init);
  };

  return () => {
    globalThis.fetch = original;
  };
}

export function profileRoute({ userId = 'user-guid' } = {}) {
  return {
    test: url => url.includes('vssps.visualstudio.com/_apis/profile/profiles/me'),
    respond: async () => ({ ok: true, json: async () => ({ id: userId }) }),
  };
}

export function permissionsRoute({ granted }) {
  return {
    test: url => url.includes('/_apis/permissions/'),
    respond: async () => ({ ok: true, json: async () => ({ value: granted }) }),
  };
}
