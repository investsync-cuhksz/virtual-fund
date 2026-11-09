import { decideOrder } from '@/lib/fund';
import { apiError, jsonBody } from '@/lib/http';
import type { DecisionRequest } from '@/lib/types';

export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return Response.json({ order: decideOrder(id, await jsonBody(request) as unknown as DecisionRequest) }); }
  catch (error) { return apiError(error); }
}
