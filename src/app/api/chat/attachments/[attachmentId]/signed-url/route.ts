import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient, storageBucket } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ attachmentId: string }> }) {
  try {
    const { attachmentId } = await params;
    const { supabase } = await requireApiUser();
    const { data: attachment, error } = await supabase
      .from("chat_attachments")
      .select("storage_path,original_filename")
      .eq("id", attachmentId)
      .is("deleted_at", null)
      .single();
    if (error || !attachment) return Response.json({ error: "Image not found." }, { status: 404 });
    const { data, error: signedError } = await createAdminClient().storage.from(storageBucket()).createSignedUrl(attachment.storage_path, 120);
    if (signedError) throw signedError;
    return Response.json({ url: data.signedUrl, filename: attachment.original_filename, expiresIn: 120 });
  } catch (error) {
    return errorResponse(error);
  }
}
