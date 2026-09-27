import { errorResponse, requireApiUser } from "@/lib/auth";
import { z } from "zod";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireApiUser();
    const { text } = z.object({ text: z.string().max(5000) }).parse(await request.json());
    const { error } = await supabase.rpc("set_picking_text", { p_order_id: id, p_text: text });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
