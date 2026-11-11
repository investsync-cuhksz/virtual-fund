import { searchInstruments } from '@/lib/fund';
import { apiError } from '@/lib/http';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return Response.json({ instruments: searchInstruments(new URL(request.url).searchParams.get('q') ?? '') }); }
  catch (error) { return apiError(error); }
}
