import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient, storageBucket } from "@/lib/supabase/admin";
import { businessDate } from "@/lib/time";
import { createOrderSchema } from "@/lib/validation";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  try {
    const { supabase } = await requireApiUser();
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || businessDate();
    const to = url.searchParams.get("to") || from;
    const query = (url.searchParams.get("q") || "").trim().slice(0, 100) || null;
    if (!datePattern.test(from) || !datePattern.test(to)) return Response.json({ error: "Invalid date range." }, { status: 400 });

    const [ordersResult, statisticsResult] = await Promise.all([
      supabase.rpc("search_orders", { p_from: from, p_to: to, p_query: query }),
      supabase.rpc("get_order_statistics", { p_from: from, p_to: to, p_query: query })
    ]);
    if (ordersResult.error) throw ordersResult.error;
    if (statisticsResult.error) throw statisticsResult.error;
    const statistics = statisticsResult.data?.[0] || {};
    return Response.json({
      orders: ordersResult.data || [],
      statistics: Object.fromEntries(Object.entries(statistics).map(([key, value]) => [key, Number(value)]))
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { supabase } = await requireApiUser();
    const input = createOrderSchema.parse(await request.json());
    const { data, error } = await supabase.rpc("create_order", {
      p_customer_name: input.customerName,
      p_original_text: input.originalText || null,
      p_notes: input.notes || null,
      p_priority: input.priority,
      p_original_files: input.originalFiles.map((file) => ({
        original_filename: file.originalFilename,
        storage_path: file.storagePath,
        mime_type: file.mimeType,
        file_size: file.size
      }))
    });
    if (error) {
      if (input.originalFiles.length) {
        await createAdminClient().storage.from(storageBucket()).remove(input.originalFiles.map((file) => file.storagePath));
      }
      throw error;
    }
    return Response.json({ order: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
