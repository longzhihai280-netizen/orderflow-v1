import { errorResponse, requireApiUser } from "@/lib/auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const { id, fileId } = await params;
    const { supabase } = await requireApiUser();
    const { error } = await supabase.rpc("delete_order_file", { p_order_id: id, p_file_id: fileId });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
