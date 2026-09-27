import { errorResponse, requireApiUser } from "@/lib/auth";
import { businessDate } from "@/lib/time";

export async function GET(request: Request) {
  try {
    const { supabase } = await requireApiUser();
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || businessDate();
    const to = url.searchParams.get("to") || from;
    const query = (url.searchParams.get("q") || "").trim().slice(0, 100) || null;
    const { data, error } = await supabase.rpc("get_order_statistics", { p_from: from, p_to: to, p_query: query });
    if (error) throw error;
    const row = data?.[0] || {};
    return Response.json({ statistics: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value)])) });
  } catch (error) {
    return errorResponse(error);
  }
}
