"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { Check } from "lucide-react";

export default function DisplayNameForm({
  userId,
  initial,
  fallback,
}: {
  userId: string;
  initial: string;
  fallback: string;
}) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    setError(null);
    if (trimmed.length < 1 || trimmed.length > 40) {
      setError("Display name must be 1–40 characters.");
      return;
    }
    setSaving(true);
    const sb = createClient();
    const { error: err } = await sb
      .from("profiles")
      .update({ display_name: trimmed })
      .eq("id", userId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    router.refresh();
  };

  return (
    <form onSubmit={save} className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={fallback}
        maxLength={40}
        className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 h-11 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)]"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving || name.trim() === initial}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] font-medium text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {saved ? (
            <>
              <Check className="w-3.5 h-3.5" />
              Saved
            </>
          ) : saving ? (
            "Saving…"
          ) : (
            "Save"
          )}
        </button>
        <div className="text-[11px] text-[var(--color-text-faint)]">
          This is what shows on the leaderboard and your public profile.
        </div>
      </div>
      {error && (
        <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </form>
  );
}
