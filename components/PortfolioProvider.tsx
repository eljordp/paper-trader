"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { loadPortfolio, savePortfolio, type Portfolio, executeBuy, executeSell, toggleWatch, resetPortfolio } from "@/lib/store";

type Ctx = {
  portfolio: Portfolio | null;
  ready: boolean;
  buy: (ticker: string, qty: number, price: number) => void;
  sell: (ticker: string, qty: number, price: number) => void;
  watch: (ticker: string) => void;
  reset: (cash?: number) => void;
};

const PortfolioCtx = createContext<Ctx | null>(null);

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPortfolio(loadPortfolio());
    setReady(true);
  }, []);

  useEffect(() => {
    if (portfolio && ready) savePortfolio(portfolio);
  }, [portfolio, ready]);

  const buy = useCallback((ticker: string, qty: number, price: number) => {
    setPortfolio((p) => (p ? executeBuy(p, ticker, qty, price) : p));
  }, []);

  const sell = useCallback((ticker: string, qty: number, price: number) => {
    setPortfolio((p) => (p ? executeSell(p, ticker, qty, price) : p));
  }, []);

  const watch = useCallback((ticker: string) => {
    setPortfolio((p) => (p ? toggleWatch(p, ticker) : p));
  }, []);

  const reset = useCallback((cash?: number) => {
    setPortfolio(resetPortfolio(cash));
  }, []);

  return (
    <PortfolioCtx.Provider value={{ portfolio, ready, buy, sell, watch, reset }}>
      {children}
    </PortfolioCtx.Provider>
  );
}

export function usePortfolio() {
  const ctx = useContext(PortfolioCtx);
  if (!ctx) throw new Error("usePortfolio must be used inside PortfolioProvider");
  return ctx;
}
