export type SuiClient = SuiJsonRpcClient;

export class SuiJsonRpcClient {
  url: string;
  network: string;

  constructor(opts: { url: string; network?: string }) {
    this.url = opts.url;
    this.network = opts.network ?? "testnet";
  }

  async getObject() {
    return { data: null };
  }

  async getOwnedObjects() {
    return { data: [] };
  }

  async multiGetObjects() {
    return [];
  }

  async queryEvents() {
    return { data: [] };
  }
}

export function getJsonRpcFullnodeUrl(network: string = "testnet") {
  if (network === "mainnet") return "https://fullnode.mainnet.sui.io:443";
  if (network === "devnet") return "https://fullnode.devnet.sui.io:443";
  return "https://fullnode.testnet.sui.io:443";
}

export interface MarketOpportunity {
  type: "arbitrage" | "volatility" | "spread";
  poolKey: string;
  baseAsset: string;
  quoteAsset: string;
  midPrice: number;
  currentPrice: string;
  fairValue: number;
  fairValueString: string;
  potentialReturn: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  timestamp: number;
  recommendedAmount?: bigint;
}

export interface MarketScoutOptions {
  client?: SuiClient;
  address?: string;
  poolKeys?: string[];
  historySize?: number;
  minSpreadBps?: number;
  volatilityBps?: number;
  mockPriceSource?: (poolKey: string) => Promise<number>;
}

export class MarketScout {
  constructor(_opts: MarketScoutOptions | SuiClient = {}) {}

  async scanMarkets(): Promise<MarketOpportunity[]> {
    return [];
  }

  async scanPool(_poolKey: string): Promise<MarketOpportunity | null> {
    return null;
  }

  scoreOpportunity(_opp: MarketOpportunity): number {
    return 0;
  }

  filterOpportunitiesByScore(opportunities: MarketOpportunity[], _threshold = 60): MarketOpportunity[] {
    return opportunities;
  }
}
