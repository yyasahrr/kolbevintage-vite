"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  ActionKey,
  hasPermission,
  isValidRoleKey,
  ModuleKey,
  ROLE_DEFINITIONS,
  RoleDefinition,
  RoleKey,
} from "@/lib/permissions";

interface RoleContextValue {
  activeRole: RoleKey;
  definition: RoleDefinition;
  switchRole: (nextRole: RoleKey) => Promise<void>;
  can: (module: ModuleKey, action?: ActionKey) => boolean;
  isSwitching: boolean;
}

const RoleContext = createContext<RoleContextValue>({
  activeRole: "super_admin",
  definition: ROLE_DEFINITIONS.super_admin,
  switchRole: async () => {},
  can: () => true,
  isSwitching: false,
});

export function RoleProvider({
  initialRole = "super_admin",
  children,
}: {
  initialRole?: RoleKey;
  children: React.ReactNode;
}) {
  const [activeRole, setActiveRole] = useState<RoleKey>(initialRole);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    fetch("/api/session/role")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.activeRole && isValidRoleKey(data.activeRole)) {
          setActiveRole(data.activeRole);
        }
      })
      .catch(() => {});
  }, []);

  const switchRole = async (nextRole: RoleKey) => {
    setIsSwitching(true);
    try {
      const res = await fetch("/api/session/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      if (res.ok) {
        setActiveRole(nextRole);
        window.location.reload();
      }
    } finally {
      setIsSwitching(false);
    }
  };

  const can = (module: ModuleKey, action: ActionKey = "view") =>
    hasPermission(activeRole, module, action);

  return (
    <RoleContext.Provider
      value={{
        activeRole,
        definition: ROLE_DEFINITIONS[activeRole],
        switchRole,
        can,
        isSwitching,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  return useContext(RoleContext);
}
