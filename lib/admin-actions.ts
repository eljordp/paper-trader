"use server";

import { adminClient, requireOwner } from "@/lib/admin";
import { revalidatePath } from "next/cache";
import type { Role } from "@/lib/roles";

// Roles owner can grant via the UI. "owner" is intentionally excluded —
// granting that has to happen in SQL to prevent accidental demotion.
const TOGGLEABLE_ROLES: Role[] = ["admin", "staff", "moderator", "beta"];

export async function toggleUserRole(userId: string, role: Role) {
  await requireOwner();
  if (!TOGGLEABLE_ROLES.includes(role)) {
    throw new Error("That role can't be granted from the UI.");
  }
  const sb = adminClient();
  const { data: profile } = await sb
    .from("profiles")
    .select("roles")
    .eq("id", userId)
    .single();
  if (!profile) throw new Error("User not found");
  const current = ((profile as { roles: string[] | null }).roles ?? []) as string[];
  const next = current.includes(role)
    ? current.filter((r) => r !== role)
    : [...current, role];
  const { error } = await sb
    .from("profiles")
    .update({ roles: next })
    .eq("id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
  return { roles: next };
}
