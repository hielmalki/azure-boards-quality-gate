const DEFAULT_ALLOWED_ORIGIN = '*';
const DEFAULT_ALLOWED_METHODS = 'GET,POST,PUT,DELETE,OPTIONS';
const DEFAULT_ALLOWED_HEADERS = 'authorization,content-type';

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.CORS_ALLOWED_ORIGIN ?? DEFAULT_ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': process.env.CORS_ALLOWED_METHODS ?? DEFAULT_ALLOWED_METHODS,
    'Access-Control-Allow-Headers': process.env.CORS_ALLOWED_HEADERS ?? DEFAULT_ALLOWED_HEADERS,
    'Access-Control-Max-Age': process.env.CORS_MAX_AGE ?? '86400',
  };
}

export function withCors(handler) {
  return async (request, context) => {
    if (request.method === 'OPTIONS') {
      return {
        status: 204,
        headers: corsHeaders(),
      };
    }

    const response = await handler(request, context);

    return {
      ...response,
      headers: {
        ...corsHeaders(),
        ...(response?.headers ?? {}),
      },
    };
  };
}
