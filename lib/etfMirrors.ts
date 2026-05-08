/**
 * ETF mirrors for futures contracts.
 * For users without a real-time CME data feed, the corresponding ETF
 * tracks futures price action at ~0.99 correlation with FREE real-time data.
 */

export type EtfMirror = {
  futures: string; // Yahoo symbol
  etf: string;
  futuresName: string;
  etfName: string;
  correlation: number;
};

export const ETF_MIRRORS: Record<string, EtfMirror> = {
  "ES=F": {
    futures: "ES=F",
    etf: "SPY",
    futuresName: "S&P 500 E-mini",
    etfName: "SPDR S&P 500 ETF",
    correlation: 0.99,
  },
  "MES=F": {
    futures: "MES=F",
    etf: "SPY",
    futuresName: "Micro S&P 500",
    etfName: "SPDR S&P 500 ETF",
    correlation: 0.99,
  },
  "NQ=F": {
    futures: "NQ=F",
    etf: "QQQ",
    futuresName: "Nasdaq-100 E-mini",
    etfName: "Invesco QQQ Trust",
    correlation: 0.99,
  },
  "MNQ=F": {
    futures: "MNQ=F",
    etf: "QQQ",
    futuresName: "Micro Nasdaq-100",
    etfName: "Invesco QQQ Trust",
    correlation: 0.99,
  },
  "YM=F": {
    futures: "YM=F",
    etf: "DIA",
    futuresName: "Dow E-mini",
    etfName: "SPDR Dow Jones ETF",
    correlation: 0.99,
  },
  "MYM=F": {
    futures: "MYM=F",
    etf: "DIA",
    futuresName: "Micro Dow",
    etfName: "SPDR Dow Jones ETF",
    correlation: 0.99,
  },
  "RTY=F": {
    futures: "RTY=F",
    etf: "IWM",
    futuresName: "Russell 2000 E-mini",
    etfName: "iShares Russell 2000 ETF",
    correlation: 0.98,
  },
  "M2K=F": {
    futures: "M2K=F",
    etf: "IWM",
    futuresName: "Micro Russell 2000",
    etfName: "iShares Russell 2000 ETF",
    correlation: 0.98,
  },
  "GC=F": {
    futures: "GC=F",
    etf: "GLD",
    futuresName: "Gold",
    etfName: "SPDR Gold Shares",
    correlation: 0.99,
  },
  "MGC=F": {
    futures: "MGC=F",
    etf: "GLD",
    futuresName: "Micro Gold",
    etfName: "SPDR Gold Shares",
    correlation: 0.99,
  },
  "SI=F": {
    futures: "SI=F",
    etf: "SLV",
    futuresName: "Silver",
    etfName: "iShares Silver Trust",
    correlation: 0.98,
  },
  "CL=F": {
    futures: "CL=F",
    etf: "USO",
    futuresName: "WTI Crude",
    etfName: "United States Oil Fund",
    correlation: 0.92,
  },
  "MCL=F": {
    futures: "MCL=F",
    etf: "USO",
    futuresName: "Micro WTI Crude",
    etfName: "United States Oil Fund",
    correlation: 0.92,
  },
  "NG=F": {
    futures: "NG=F",
    etf: "UNG",
    futuresName: "Natural Gas",
    etfName: "United States Natural Gas Fund",
    correlation: 0.85,
  },
};

export function getEtfMirror(symbol: string): EtfMirror | null {
  return ETF_MIRRORS[symbol.toUpperCase()] ?? null;
}
