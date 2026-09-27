import { errorResponse, requireApiUser } from "@/lib/auth";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireApiUser();
    const { data, error } = await supabase.rpc("accept_order", { p_order_id: id });
    if (error) throw error;
    return Response.json({ order: data });
  } catch (error) {
    return errorResponse(error);
  }
}
