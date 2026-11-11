import { previewOrder } from '@/lib/fund';
import { apiError, jsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try { return Response.json(previewOrder(await jsonBody(request))); }
  catch (error) { return apiError(error); }
}
