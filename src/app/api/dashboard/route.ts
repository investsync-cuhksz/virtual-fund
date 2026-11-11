import { getDashboard } from '@/lib/fund';
import { apiError } from '@/lib/http';

export const runtime = 'nodejs';
export async function GET() {
  try { return Response.json(getDashboard()); }
  catch (error) { return apiError(error); }
}
