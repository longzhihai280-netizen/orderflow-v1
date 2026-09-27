import { errorResponse, requireApiUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const updateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "EMPLOYEE"]).optional(),
  active: z.boolean().optional(),
  canChangePriority: z.boolean().optional(),
  canChangeAuxStatus: z.boolean().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { user } = await requireApiUser({ admin: true });
    const input = updateUserSchema.parse(await request.json());
    if (id === user.id && input.active === false) return Response.json({ error: "You cannot disable your own account." }, { status: 400 });
    const updates = {
      ...(input.displayName !== undefined && { display_name: input.displayName }),
      ...(input.role !== undefined && { role: input.role }),
      ...(input.active !== undefined && { active: input.active }),
      ...(input.canChangePriority !== undefined && { can_change_priority: input.canChangePriority }),
      ...(input.canChangeAuxStatus !== undefined && { can_change_aux_status: input.canChangeAuxStatus })
    };
    const admin = createAdminClient();
    const { data, error } = await admin.from("profiles").update(updates).eq("id", id).select("*").single();
    if (error) throw error;
    return Response.json({ user: data });
  } catch (error) {
    return errorResponse(error);
  }
}
