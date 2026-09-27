import { errorResponse, requireApiUser } from "@/lib/auth";
import { z } from "zod";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireApiUser();
    const { priority } = z.object({ priority: z.enum(["NORMAL", "HIGH", "URGENT"]) }).parse(await request.json());
    const { error } = await supabase.rpc("change_order_priority", { p_order_id: id, p_priority: priority });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
