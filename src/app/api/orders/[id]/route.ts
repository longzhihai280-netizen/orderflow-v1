import { errorResponse, requireApiUser } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { supabase, profile } = await requireApiUser();
    const [orderResult, filesResult, activityResult] = await Promise.all([
      supabase.from("orders_dashboard").select("*").eq("id", id).single(),
      supabase.from("order_files").select("*").eq("order_id", id).is("deleted_at", null).order("uploaded_at"),
      supabase.from("order_activity_with_actor").select("*").eq("order_id", id).order("created_at", { ascending: false })
    ]);
    if (orderResult.error) throw orderResult.error;
    if (filesResult.error) throw filesResult.error;
    if (activityResult.error) throw activityResult.error;
    return Response.json({ order: orderResult.data, files: filesResult.data || [], activity: activityResult.data || [], profile });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const { supabase } = await requireApiUser({ admin: true });
    const body = await request.json().catch(() => ({}));
    const { error } = await supabase.rpc("archive_order", { p_order_id: id, p_reason: String(body.reason || "").slice(0, 500) || null });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
