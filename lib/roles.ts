export type Role = "admin" | "owner" | "staff" | "beta" | "moderator";

export const ROLES: Record<Role, { label: string; color: string; colorRgb: string }> = {
  owner: { label: "Owner", color: "var(--color-elite)", colorRgb: "236, 72, 153" },
  admin: { label: "Admin", color: "var(--color-pro)", colorRgb: "245, 158, 11" },
  staff: { label: "Staff", color: "var(--color-phase2)", colorRgb: "168, 85, 247" },
  moderator: { label: "Mod", color: "var(--color-phase1)", colorRgb: "59, 130, 246" },
  beta: { label: "Beta", color: "var(--color-cyan)", colorRgb: "79, 220, 224" },
};

export function hasRole(
  profile: { roles?: string[] | null } | null | undefined,
  role: Role
): boolean {
  if (!profile?.roles) return false;
  return profile.roles.includes(role);
}

export function isAdmin(profile: { roles?: string[] | null } | null | undefined): boolean {
  return hasRole(profile, "admin") || hasRole(profile, "owner");
}

export function highestRole(
  profile: { roles?: string[] | null } | null | undefined
): Role | null {
  if (!profile?.roles || profile.roles.length === 0) return null;
  const order: Role[] = ["owner", "admin", "staff", "moderator", "beta"];
  for (const r of order) {
    if (profile.roles.includes(r)) return r;
  }
  return null;
}
