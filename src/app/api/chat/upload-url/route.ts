import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient, storageBucket } from "@/lib/supabase/admin";
import { imageUploadSchema, safeExtension, validateUpload } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const { user } = await requireApiUser();
    const input = imageUploadSchema.parse(await request.json());
    const validationError = validateUpload("ORIGINAL", input.mimeType, input.size);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    const path = `chat/${user.id}/${crypto.randomUUID()}.${safeExtension(input.mimeType)}`;
    const { data, error } = await createAdminClient().storage.from(storageBucket()).createSignedUploadUrl(path);
    if (error) throw error;
    return Response.json({ path, token: data.token });
  } catch (error) {
    return errorResponse(error);
  }
}
