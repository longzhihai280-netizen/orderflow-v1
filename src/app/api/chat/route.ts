import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient, storageBucket } from "@/lib/supabase/admin";
import { createChatMessageSchema } from "@/lib/validation";

export async function GET() {
  try {
    const { supabase, profile } = await requireApiUser();
    const { data: messages, error } = await supabase
      .from("chat_messages_with_sender")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    const ordered = [...(messages || [])].reverse();
    const ids = ordered.map((message) => message.id);
    const attachmentsResult = ids.length
      ? await supabase.from("chat_attachments").select("id,message_id,original_filename,mime_type,file_size,uploaded_at").in("message_id", ids).is("deleted_at", null).order("uploaded_at")
      : { data: [], error: null };
    if (attachmentsResult.error) throw attachmentsResult.error;
    return Response.json({
      messages: ordered.map((message) => ({
        ...message,
        attachments: (attachmentsResult.data || []).filter((attachment) => attachment.message_id === message.id)
      })),
      profile
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  let uploadedPaths: string[] = [];
  try {
    const { supabase } = await requireApiUser();
    const input = createChatMessageSchema.parse(await request.json());
    uploadedPaths = input.attachments.map((file) => file.storagePath);
    const { data, error } = await supabase.rpc("create_chat_message", {
      p_text: input.text || null,
      p_order_id: input.orderId || null,
      p_attachments: input.attachments.map((file) => ({
        original_filename: file.originalFilename,
        storage_path: file.storagePath,
        mime_type: file.mimeType,
        file_size: file.size
      }))
    });
    if (error) throw error;
    return Response.json({ message: data }, { status: 201 });
  } catch (error) {
    if (uploadedPaths.length) await createAdminClient().storage.from(storageBucket()).remove(uploadedPaths);
    return errorResponse(error);
  }
}
