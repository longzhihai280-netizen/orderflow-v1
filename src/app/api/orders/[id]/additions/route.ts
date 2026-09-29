import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient, storageBucket } from "@/lib/supabase/admin";
import { createAdditionSchema } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let uploadedPaths: string[] = [];
  try {
    const { id } = await params;
    const { supabase } = await requireApiUser();
    const input = createAdditionSchema.parse(await request.json());
    uploadedPaths = input.files.map((file) => file.storagePath);
    const { data, error } = await supabase.rpc("create_order_addition", {
      p_order_id: id,
      p_text: input.text || null,
      p_files: input.files.map((file) => ({
        original_filename: file.originalFilename,
        storage_path: file.storagePath,
        mime_type: file.mimeType,
        file_size: file.size
      }))
    });
    if (error) throw error;
    return Response.json({ addition: data }, { status: 201 });
  } catch (error) {
    if (uploadedPaths.length) await createAdminClient().storage.from(storageBucket()).remove(uploadedPaths);
    return errorResponse(error);
  }
}
