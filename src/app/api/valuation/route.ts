import { listRuns, runValuation } from '@/lib/fund';
import { apiError, jsonBody } from '@/lib/http';

export const runtime = 'nodejs';
export async function GET() {
  try { return Response.json({ runs: listRuns() }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { const body = await jsonBody(request); return Response.json({ run: runValuation(body.date as string) }); }
  catch (error) { return apiError(error); }
}
