import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const createUserSchema = z.object({
  email: z.email(),
  password: z.string().min(12).max(200),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{1,39}$/),
  displayName: z.string().trim().min(1).max(100),
  role: z.enum(["ADMIN", "EMPLOYEE"]).default("EMPLOYEE")
});

export async function GET() {
  try {
    await requireApiUser({ admin: true });
    const admin = createAdminClient();
    const { data, error } = await admin.from("profiles").select("*").order("display_name");
    if (error) throw error;
    return Response.json({ users: data || [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiUser({ admin: true });
    const input = createUserSchema.parse(await request.json());
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { username: input.username, display_name: input.displayName }
    });
    if (error) throw error;
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .update({ username: input.username, display_name: input.displayName, role: input.role, active: true })
      .eq("id", data.user.id)
      .select("*")
      .single();
    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw profileError;
    }
    return Response.json({ user: profile }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
