"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { ROLES, type Role, hasRole } from "@/lib/roles";
import { effectivePlan, isTrialActive, trialDaysRemaining, type Plan } from "@/lib/plans";
import { signOut } from "@/lib/actions";
import { LogOut, Settings as SettingsIcon, User as UserIcon, Crown, Sparkles, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  roles: string[] | null;
  plan: Plan | null;
  trial_until: string | null;
  pro_until: string | null;
  is_pro: boolean | null;
};

export default function AvatarMenu({ profile }: { profile: Profile }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const plan = effectivePlan({
    plan: profile.plan,
    trial_until: profile.trial_until,
    pro_until: profile.pro_until,
    is_pro: profile.is_pro,
  });
  const trialDays = trialDaysRemaining(profile.trial_until);
  const trialActive = isTrialActive(profile.trial_until);

  const role = (profile.roles ?? []).find((r) => r in ROLES) as Role | undefined;
  const roleCfg = role ? ROLES[role] : null;
  const isOwner = hasRole(profile, "owner");

  const planLabel =
    trialActive && plan === "pro" && profile.plan === "free"
      ? `Pro trial · ${trialDays}d left`
      : plan.toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity rounded-full"
        title={profile.display_name ?? "Account"}
      >
        <Avatar
          name={profile.display_name ?? "trader"}
          src={profile.avatar_url}
          size={30}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-64 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xl overflow-hidden z-50"
          role="menu"
        >
          {/* Identity row */}
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center gap-3">
            <Avatar
              name={profile.display_name ?? "trader"}
              src={profile.avatar_url}
              size={40}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">
                {profile.display_name ?? "trader"}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={cn(
                    "text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium",
                    plan === "free"
                      ? "text-[var(--color-text-faint)]"
                      : "",
                  )}
                  style={
                    plan === "pro"
                      ? {
                          color: "var(--color-phase1)",
                          background: "rgba(59, 130, 246, 0.12)",
                          border: "1px solid rgba(59, 130, 246, 0.4)",
                        }
                      : plan === "vip"
                        ? {
                            color: "var(--color-pro)",
                            background: "rgba(245, 158, 11, 0.12)",
                            border: "1px solid rgba(245, 158, 11, 0.4)",
                          }
                        : plan === "enterprise"
                          ? {
                              color: "var(--color-elite)",
                              background: "rgba(236, 72, 153, 0.12)",
                              border: "1px solid rgba(236, 72, 153, 0.4)",
                            }
                          : {
                              background: "rgba(139, 149, 167, 0.1)",
                            }
                  }
                >
                  {trialActive && plan === "pro" && profile.plan === "free" ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" /> {planLabel}
                    </span>
                  ) : (
                    planLabel
                  )}
                </span>
                {roleCfg && (
                  <span
                    className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
                    style={{
                      color: roleCfg.color,
                      background: `rgba(${roleCfg.colorRgb}, 0.12)`,
                      border: `1px solid rgba(${roleCfg.colorRgb}, 0.4)`,
                    }}
                  >
                    {roleCfg.label}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1">
            <MenuItem
              href={`/u/${profile.id}`}
              icon={<UserIcon className="w-4 h-4" />}
              label="View profile"
              onClick={() => setOpen(false)}
            />
            <MenuItem
              href="/settings"
              icon={<SettingsIcon className="w-4 h-4" />}
              label="Settings"
              onClick={() => setOpen(false)}
            />
            {plan === "free" ? (
              <MenuItem
                href="/pro"
                icon={<Sparkles className="w-4 h-4" />}
                label="Upgrade to Pro"
                onClick={() => setOpen(false)}
                accent
              />
            ) : (
              <MenuItem
                href="/pro"
                icon={<Sparkles className="w-4 h-4" />}
                label="Manage plan"
                onClick={() => setOpen(false)}
              />
            )}
            {isOwner && (
              <MenuItem
                href="/admin"
                icon={<Crown className="w-4 h-4" />}
                label="Owner console"
                onClick={() => setOpen(false)}
              />
            )}
          </div>

          <div className="py-1 border-t border-[var(--color-border)]">
            <form action={signOut} className="contents">
              <button
                type="submit"
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-[var(--color-text-dim)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  href,
  icon,
  label,
  onClick,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm transition-colors",
        accent
          ? "text-[var(--color-up)] hover:bg-[var(--color-bg)]"
          : "text-[var(--color-text-dim)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
