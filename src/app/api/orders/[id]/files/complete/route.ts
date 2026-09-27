import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient, storageBucket } from "@/lib/supabase/admin";
import { uploadRequestSchema, validateUpload } from "@/lib/validation";
import { z } from "zod";

const completeSchema = uploadRequestSchema.extend({ storagePath: z.string().min(1).max(500) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { supabase } = await requireApiUser();
    const input = completeSchema.parse(await request.json());
    if (input.section === "ORIGINAL") return Response.json({ error: "Original files are read-only after order creation." }, { status: 400 });
    const expectedPrefix = `orders/${id}/${input.section.toLowerCase()}/`;
    if (!input.storagePath.startsWith(expectedPrefix) || input.storagePath.includes("..")) {
      return Response.json({ error: "Invalid storage path." }, { status: 400 });
    }
    const validationError = validateUpload(input.section, input.mimeType, input.size);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });

    const slash = input.storagePath.lastIndexOf("/");
    const folder = input.storagePath.slice(0, slash);
    const filename = input.storagePath.slice(slash + 1);
    const admin = createAdminClient();
    const { data: objects, error: listError } = await admin.storage.from(storageBucket()).list(folder, { search: filename, limit: 10 });
    if (listError) throw listError;
    const object = objects?.find((item) => item.name === filename);
    if (!object) return Response.json({ error: "Uploaded object could not be verified." }, { status: 400 });
    const storedSize = Number(object.metadata?.size || input.size);
    const storedMime = String(object.metadata?.mimetype || input.mimeType);
    const storedValidation = validateUpload(input.section, storedMime, storedSize);
    if (storedValidation || storedSize !== input.size || storedMime !== input.mimeType) {
      await admin.storage.from(storageBucket()).remove([input.storagePath]);
      return Response.json({ error: storedValidation || "Uploaded file metadata did not match." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("register_order_file", {
      p_order_id: id,
      p_section_type: input.section,
      p_original_filename: input.originalFilename,
      p_storage_path: input.storagePath,
      p_mime_type: input.mimeType,
      p_file_size: input.size,
      p_replaced_file_id: input.replacedFileId || null
    });
    if (error) {
      await admin.storage.from(storageBucket()).remove([input.storagePath]);
      throw error;
    }
    return Response.json({ file: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
