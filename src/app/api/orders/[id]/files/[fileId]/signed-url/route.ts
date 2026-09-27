import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient, storageBucket } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  try {
    const { id, fileId } = await params;
    const { supabase } = await requireApiUser();
    const { data: file, error } = await supabase
      .from("order_files")
      .select("storage_path,original_filename")
      .eq("id", fileId)
      .eq("order_id", id)
      .is("deleted_at", null)
      .single();
    if (error || !file) return Response.json({ error: "File not found." }, { status: 404 });
    const admin = createAdminClient();
    const { data, error: signedError } = await admin.storage.from(storageBucket()).createSignedUrl(file.storage_path, 120, {
      download: false
    });
    if (signedError) throw signedError;
    return Response.json({ url: data.signedUrl, filename: file.original_filename, expiresIn: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
