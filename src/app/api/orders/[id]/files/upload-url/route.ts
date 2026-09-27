import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient, storageBucket } from "@/lib/supabase/admin";
import { safeExtension, uploadRequestSchema, validateUpload } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireApiUser();
    const input = uploadRequestSchema.parse(await request.json());
    if (input.section === "ORIGINAL") return Response.json({ error: "Original files are read-only after order creation." }, { status: 400 });
    const validationError = validateUpload(input.section, input.mimeType, input.size);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const { data: order } = await supabase.from("orders").select("id,accepted_by").eq("id", id).single();
    if (!order) return Response.json({ error: "Order not found." }, { status: 404 });
    if (!order.accepted_by) {
      return Response.json({ error: "Accept the order before adding processing files." }, { status: 409 });
    }

    const filename = `${crypto.randomUUID()}.${safeExtension(input.mimeType)}`;
    const path = `orders/${id}/${input.section.toLowerCase()}/${filename}`;
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(storageBucket()).createSignedUploadUrl(path);
    if (error) throw error;
    return Response.json({ path, token: data.token });
  } catch (error) {
    return errorResponse(error);
  }
}
