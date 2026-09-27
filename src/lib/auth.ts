import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/domain";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireApiUser(options?: { admin?: boolean }) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ApiError(401, "Sign in is required.");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (!profile || !profile.active) throw new ApiError(403, "This account is disabled.");
  if (options?.admin && profile.role !== "ADMIN") throw new ApiError(403, "Admin access is required.");
  return { supabase, user, profile: profile as Profile };
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error
    ? error.message
    : typeof error === "object" && error !== null && "message" in error && typeof error.message === "string"
      ? error.message
      : "Unexpected server error.";
  const permission = message.includes("permission") || message.includes("disabled") || message.includes("Admin access");
  return Response.json({ error: message }, { status: permission ? 403 : 400 });
}
