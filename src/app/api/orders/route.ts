import { createOrder, listOrders } from '@/lib/fund';
import { apiError, jsonBody } from '@/lib/http';
import type { NewOrder } from '@/lib/types';

export const runtime = 'nodejs';
export async function GET() {
  try { return Response.json({ orders: listOrders() }); }
  catch (error) { return apiError(error); }
}
export async function POST(request: Request) {
  try { return Response.json({ order: createOrder(await jsonBody(request) as unknown as NewOrder) }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
