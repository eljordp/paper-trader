"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PortfolioSnapshot } from "@/lib/portfolio-data";

const Ctx = createContext<PortfolioSnapshot | null>(null);

export function PortfolioProvider({
  snapshot,
  children,
}: {
  snapshot: PortfolioSnapshot | null;
  children: ReactNode;
}) {
  return <Ctx.Provider value={snapshot}>{children}</Ctx.Provider>;
}

export function usePortfolio() {
  return useContext(Ctx);
}
