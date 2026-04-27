"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";

export default function LoginClient() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const sb = createClient();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="font-serif text-5xl tracking-tight">Welcome back</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            Magic link login. No passwords.
          </p>
        </div>

        {sent ? (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-6 text-center space-y-2">
            <div className="font-serif text-xl">Check your email</div>
            <p className="text-sm text-[var(--color-text-dim)]">
              We sent a magic link to <span className="text-[var(--color-text)] font-mono">{email}</span>. Click it to log in.
            </p>
            <button
              onClick={() => setSent(false)}
              className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text-dim)] mt-3"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 h-11 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)]"
            />
            <button
              disabled={loading || !email}
              className="w-full h-11 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] font-medium text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
            {error && (
              <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
                {error}
              </div>
            )}
          </form>
        )}

        <div className="text-center text-xs text-[var(--color-text-faint)]">
          By signing in you agree to practice not gamble.{" "}
          <Link href="/learn" className="underline">
            Learn the rules
          </Link>
        </div>
      </div>
    </div>
  );
}
