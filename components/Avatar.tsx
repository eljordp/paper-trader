"use client";

import { useState } from "react";

const PALETTE = [
  ["#3b82f6", "#06b6d4"], // blue → cyan
  ["#a855f7", "#ec4899"], // violet → pink
  ["#f59e0b", "#ef4444"], // amber → red
  ["#10b981", "#3b82f6"], // emerald → blue
  ["#ec4899", "#f59e0b"], // pink → amber
  ["#06b6d4", "#10b981"], // cyan → emerald
  ["#f43f5e", "#a855f7"], // rose → violet
  ["#84cc16", "#06b6d4"], // lime → cyan
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  name,
  src,
  size = 40,
  className,
  ring,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const useInitials = !src || imgFailed;

  const idx = hashString(name) % PALETTE.length;
  const [c1, c2] = PALETTE[idx];

  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: size * 0.38,
    background: useInitials
      ? `linear-gradient(135deg, ${c1}, ${c2})`
      : undefined,
  };

  return (
    <div
      className={`relative shrink-0 inline-flex items-center justify-center rounded-full overflow-hidden font-medium text-white ${
        ring ? "ring-2 ring-[var(--color-bg)]" : ""
      } ${className ?? ""}`}
      style={style}
    >
      {useInitials ? (
        <span className="select-none">{initials(name)}</span>
      ) : (
        <img
          src={src!}
          alt={name}
          width={size}
          height={size}
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      )}
    </div>
  );
}
