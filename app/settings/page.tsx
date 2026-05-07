import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AvatarUpload from "@/components/AvatarUpload";
import DisplayNameForm from "./display-name-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await sb
    .from("profiles")
    .select("id, display_name, avatar_url, email")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/");
  const p = profile as {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    email: string | null;
  };

  return (
    <div className="max-w-[700px] mx-auto px-6 py-8 space-y-12">
      <div>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          Settings
        </div>
        <h1 className="font-serif text-5xl mt-1">Profile</h1>
      </div>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Photo</h2>
        <AvatarUpload
          userId={p.id}
          displayName={p.display_name ?? p.email?.split("@")[0] ?? "trader"}
          initialUrl={p.avatar_url}
        />
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Display name</h2>
        <DisplayNameForm
          userId={p.id}
          initial={p.display_name ?? ""}
          fallback={p.email?.split("@")[0] ?? "trader"}
        />
      </section>

      <section className="space-y-4">
        <h2 className="font-serif text-2xl">Email</h2>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 h-11 flex items-center text-sm text-[var(--color-text-dim)]">
          {p.email}
        </div>
        <div className="text-[11px] text-[var(--color-text-faint)]">
          Email changes coming soon. Reach out to support if you need it changed.
        </div>
      </section>
    </div>
  );
}
