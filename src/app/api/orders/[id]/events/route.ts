import { listOrderEvents } from '@/lib/fund';
import { apiError } from '@/lib/http';

export const runtime = 'nodejs';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return Response.json({ events: listOrderEvents(id) }); }
  catch (error) { return apiError(error); }
}
