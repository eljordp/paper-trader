import { createClient as createSupaClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { hasRole } from "@/lib/roles";

/**
 * Service-role client. Bypasses RLS. ONLY use after authorizing the caller
 * via requireOwnerOrAdmin() or similar.
 */
export function adminClient() {
  return createSupaClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

/**
 * Server-side gate: redirects to / if the current user isn't owner/admin.
 * Returns { user, profile, sb } so the caller doesn't need to re-fetch.
 */
export async function requireOwnerOrAdmin() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/");
  const p = profile as { roles: string[] | null };
  if (!hasRole(p, "owner") && !hasRole(p, "admin")) {
    redirect("/");
  }
  return { user, profile, sb };
}
