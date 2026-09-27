import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient, storageBucket } from "@/lib/supabase/admin";
import { safeExtension, validateUpload } from "@/lib/validation";
import { z } from "zod";

const schema = z.object({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive()
});

export async function POST(request: Request) {
  try {
    const { user } = await requireApiUser();
    const input = schema.parse(await request.json());
    const validationError = validateUpload("ORIGINAL", input.mimeType, input.size);
    if (validationError) return Response.json({ error: validationError }, { status: 400 });
    const path = `pending-orders/${user.id}/${crypto.randomUUID()}.${safeExtension(input.mimeType)}`;
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(storageBucket()).createSignedUploadUrl(path);
    if (error) throw error;
    return Response.json({ path, token: data.token });
  } catch (error) {
    return errorResponse(error);
  }
}
