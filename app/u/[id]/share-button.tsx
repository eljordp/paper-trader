"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

export default function ShareButton({
  displayName,
  userId,
}: {
  displayName: string;
  userId: string;
}) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/u/${userId}`;
    const text = `${displayName}'s trading record on Paper Trader — ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${displayName} on Paper Trader`, text, url });
        return;
      } catch {
        // user cancelled — fall through to copy
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <button
      onClick={share}
      className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-border-strong)] text-sm transition-colors"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-[var(--color-up)]" />
          Copied
        </>
      ) : (
        <>
          <Share2 className="w-3.5 h-3.5" />
          Share
        </>
      )}
    </button>
  );
}
