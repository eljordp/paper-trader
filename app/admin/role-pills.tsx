"use client";

import { useState, useTransition } from "react";
import { toggleUserRole } from "@/lib/admin-actions";
import { ROLES, type Role } from "@/lib/roles";

const TOGGLEABLE: Role[] = ["admin", "staff", "moderator", "beta"];

export default function RolePills({
  userId,
  initialRoles,
}: {
  userId: string;
  initialRoles: string[];
}) {
  const [roles, setRoles] = useState<string[]>(initialRoles);
  const [pending, startTransition] = useTransition();
  const [busyRole, setBusyRole] = useState<Role | null>(null);

  const onToggle = (role: Role) => {
    setBusyRole(role);
    startTransition(async () => {
      try {
        const res = await toggleUserRole(userId, role);
        setRoles(res.roles);
      } catch (e) {
        alert(e instanceof Error ? e.message : "Failed");
      } finally {
        setBusyRole(null);
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-1">
      {/* Display owner badge if present (read-only) */}
      {roles.includes("owner") && (
        <span
          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium opacity-80"
          style={{
            color: ROLES.owner.color,
            background: `rgba(${ROLES.owner.colorRgb}, 0.12)`,
          }}
          title="Owner role can only be set in SQL"
        >
          {ROLES.owner.label}
        </span>
      )}
      {TOGGLEABLE.map((r) => {
        const cfg = ROLES[r];
        const has = roles.includes(r);
        const isBusy = pending && busyRole === r;
        return (
          <button
            key={r}
            type="button"
            disabled={pending}
            onClick={() => onToggle(r)}
            className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium transition-opacity ${
              isBusy ? "opacity-50" : ""
            } ${pending && !isBusy ? "opacity-40" : ""}`}
            style={
              has
                ? {
                    color: cfg.color,
                    background: `rgba(${cfg.colorRgb}, 0.16)`,
                    border: `1px solid rgba(${cfg.colorRgb}, 0.5)`,
                  }
                : {
                    color: "var(--color-text-faint)",
                    background: "transparent",
                    border: "1px solid var(--color-border)",
                  }
            }
            title={has ? `Click to remove ${cfg.label}` : `Click to grant ${cfg.label}`}
          >
            {cfg.label}
          </button>
        );
      })}
    </div>
  );
}
