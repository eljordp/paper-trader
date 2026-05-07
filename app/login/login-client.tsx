"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import Link from "next/link";

export default function LoginClient() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const sb = createClient();

    if (mode === "signup") {
      const { error: err } = await sb.auth.signUp({ email, password });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      // signUp logs the user in immediately if email confirmation is disabled
      router.push("/");
      router.refresh();
    } else {
      const { error: err } = await sb.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3 text-center">
          <h1 className="font-serif text-5xl tracking-tight">
            {mode === "signup" ? "Start trading" : "Welcome back"}
          </h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {mode === "signup"
              ? "Free $25K Rookie account. No credit card."
              : "Sign in to your paper trader account."}
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 h-11 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)]"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Pick a password (min 6 chars)" : "Password"}
            className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md px-4 h-11 text-sm placeholder:text-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-border-strong)]"
          />
          <button
            disabled={loading || !email || password.length < 6}
            className="w-full h-11 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] font-medium text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading
              ? mode === "signup"
                ? "Creating account…"
                : "Signing in…"
              : mode === "signup"
              ? "Create account"
              : "Sign in"}
          </button>
          {error && (
            <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </form>

        <div className="text-center text-sm text-[var(--color-text-dim)]">
          {mode === "signup" ? (
            <>
              Already have an account?{" "}
              <button
                onClick={() => {
                  setMode("signin");
                  setError(null);
                }}
                className="text-[var(--color-text)] hover:underline"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              New here?{" "}
              <button
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className="text-[var(--color-text)] hover:underline"
              >
                Create an account
              </button>
            </>
          )}
        </div>

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
