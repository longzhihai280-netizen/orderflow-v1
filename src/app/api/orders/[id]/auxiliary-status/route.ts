import { errorResponse, requireApiUser } from "@/lib/auth";
import { z } from "zod";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireApiUser();
    const { status } = z.object({ status: z.enum(["NONE", "PENDING_CONFIRMATION", "OUT_OF_STOCK"]) }).parse(await request.json());
    const { error } = await supabase.rpc("change_auxiliary_status", { p_order_id: id, p_status: status });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
