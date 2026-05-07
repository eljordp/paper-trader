"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import Avatar from "./Avatar";
import { Upload, X } from "lucide-react";

export default function AvatarUpload({
  userId,
  displayName,
  initialUrl,
}: {
  userId: string;
  displayName: string;
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const sb = createClient();

  const onSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError("Max 2MB.");
      return;
    }
    if (!/^image\//.test(file.type)) {
      setError("Image files only.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await sb.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data } = sb.storage.from("avatars").getPublicUrl(path);
      const newUrl = `${data.publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await sb
        .from("profiles")
        .update({ avatar_url: newUrl })
        .eq("id", userId);
      if (dbErr) throw dbErr;
      setUrl(newUrl);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    setUploading(true);
    setError(null);
    try {
      await sb.from("profiles").update({ avatar_url: null }).eq("id", userId);
      setUrl(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <Avatar name={displayName} src={url} size={88} />
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-[var(--color-text)] text-[var(--color-bg)] text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Upload className="w-3.5 h-3.5" />
            {uploading ? "Uploading…" : url ? "Change photo" : "Upload photo"}
          </button>
          {url && (
            <button
              type="button"
              onClick={remove}
              disabled={uploading}
              className="block text-xs text-[var(--color-text-faint)] hover:text-[var(--color-down)] transition-colors"
            >
              <X className="w-3 h-3 inline-block mr-1" />
              Remove
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={onSelect}
        className="hidden"
      />
      <div className="text-[11px] text-[var(--color-text-faint)]">
        JPG, PNG, WebP or GIF. Max 2MB. Square crops best.
      </div>
      {error && (
        <div className="text-xs text-[var(--color-down)] bg-[var(--color-down)]/10 border border-[var(--color-down)]/30 rounded-md px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
