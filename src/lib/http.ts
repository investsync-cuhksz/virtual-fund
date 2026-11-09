import { FundError } from './fund';

export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch { /* Return a consistent API error below. */ }
  throw new FundError(400, 'INVALID_JSON', 'Send a JSON object.');
}

export function apiError(error: unknown): Response {
  if (error instanceof FundError) return Response.json({ error: { code: error.code, message: error.message }, ...(error.checks ? { checks: error.checks } : {}) }, { status: error.status });
  console.error(error);
  return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong.' } }, { status: 500 });
}
