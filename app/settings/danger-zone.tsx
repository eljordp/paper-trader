"use client";

import { useState, useTransition } from "react";
import { signOutAllSessions, deleteMyAccount } from "@/lib/settings-actions";
import { AlertTriangle, LogOut, Trash2 } from "lucide-react";

export default function DangerZone() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  const onSignOutAll = () => {
    if (!confirm("Sign out of every browser/device? You'll need to log in again.")) return;
    setStatus(null);
    startTransition(async () => {
      try {
        await signOutAllSessions();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  const onDelete = () => {
    if (confirmDelete.toLowerCase() !== "delete") {
      setStatus('Type "delete" to confirm.');
      return;
    }
    if (!confirm("Permanently delete your account, all accounts, trades, and history. This can't be undone.")) return;
    setStatus(null);
    startTransition(async () => {
      try {
        await deleteMyAccount();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed");
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-5 space-y-3">
        <div className="flex items-start gap-3">
          <LogOut className="w-5 h-5 text-[var(--color-text-dim)] shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium">Sign out of all sessions</div>
            <div className="text-xs text-[var(--color-text-dim)] mt-1">
              Useful if you logged in on a device you don&apos;t have access to anymore.
            </div>
          </div>
          <button
            type="button"
            onClick={onSignOutAll}
            disabled={pending}
            className="px-3 h-9 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-xs uppercase tracking-wider hover:border-[var(--color-border-strong)] disabled:opacity-50"
          >
            Sign out everywhere
          </button>
        </div>
      </div>

      <div className="rounded-lg p-5 space-y-3 border border-[var(--color-down)]/30 bg-[var(--color-down)]/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--color-down)] shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium text-[var(--color-down)]">Delete account</div>
            <div className="text-xs text-[var(--color-text-dim)] mt-1">
              Permanently removes your profile, every paper account, every trade, and your watchlist.
              This can&apos;t be undone.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <input
            type="text"
            placeholder='Type "delete" to confirm'
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            className="flex-1 px-3 h-10 rounded-md bg-[var(--color-bg)] border border-[var(--color-border)] text-sm"
          />
          <button
            type="button"
            onClick={onDelete}
            disabled={pending || confirmDelete.toLowerCase() !== "delete"}
            className="inline-flex items-center gap-1.5 px-3 h-10 rounded-md bg-[var(--color-down)] text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Trash2 className="w-4 h-4" /> Delete forever
          </button>
        </div>
      </div>

      {status && (
        <div className="text-xs text-[var(--color-down)]">{status}</div>
      )}
    </div>
  );
}
