import { errorResponse, requireApiUser } from "@/lib/auth";

export async function GET() {
  try {
    const { profile } = await requireApiUser();
    return Response.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}
