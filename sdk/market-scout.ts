// Sui JSON-RPC client (classic) — has getObject / getOwnedObjects / etc.
// Available in @mysten/sui/jsonRpc for the new SDK shape.
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { SuiGraphQLClient } from "@mysten/sui/graphql";
import { createDeepBookTestnetClient, type SuiVaultDeepBookPoolKey } from './deepbook.js';

// Public type alias — keep "SuiClient" as the JSON-RPC client used across the SDK.
export type SuiClient = SuiJsonRpcClient;
export { SuiJsonRpcClient, getJsonRpcFullnodeUrl };
// Local re-export so the deepbook-v3 type doesn't leak into the public surface.
type DeepBookClient = ReturnType<typeof createDeepBookTestnetClient>;

/**
 * Build a SuiClient whose `.core` API matches what DeepBook v3 expects.
 * DeepBook's read APIs (e.g. `midPrice`) call `client.core.simulateTransaction`,
 * which only exists on the modern SuiGraphQLClient. The classic `SuiJsonRpcClient`
 * (fullnode JSON-RPC) does NOT have a `.core` field, so it crashes on contact.
 */
function buildCompatibleClient(opts: {
  client?: SuiClient;
  address?: string;
  network?: "testnet" | "mainnet" | "devnet";
}): any {
  if (opts.client && (opts.client as any).core) return opts.client as any;
  const network = opts.network ?? "testnet";
  // Testnet graphql endpoint – same node, GraphQL surface, .core present.
  const url = network === "mainnet"
    ? "https://graphql.mainnet.sui.io/graphql"
    : network === "devnet"
      ? "https://graphql.devnet.sui.io/graphql"
      : "https://graphql.testnet.sui.io/graphql";
  return new SuiGraphQLClient({ url, network }) as any;
}

export interface MarketOpportunity {
  type: "arbitrage" | "volatility" | "spread";
  poolKey: string;
  baseAsset: string;
  quoteAsset: string;
  /** Human-readable mid price, e.g. 1.234 (alias: `currentPrice`).
   *  Big-endian "bigDecimal" string form for downstream audit payloads. */
  midPrice: number;
  currentPrice: string; // big-decimal string of midPrice
  fairValue: number;
  fairValueString: string;
  potentialReturn: number; // percent
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  timestamp: number;
  recommendedAmount?: bigint; // base units
}

export interface MarketScoutOptions {
  /** Optional override SuiClient (defaults to a fresh testnet client). */
  client?: SuiClient;
  /** Address used to construct the DeepBook client (does not need funds). */
  address?: string;
  /** Pools to scan. Defaults to the canonical SuiVault DeepBook testnet pairs. */
  poolKeys?: string[];
  /** Rolling window size used for fair-value/volatility detection. */
  historySize?: number;
  /** Spread (bps) that counts as a tradable opportunity. */
  minSpreadBps?: number;
  /** Deviation from rolling mean that flags a volatility event. */
  volatilityBps?: number;
  /** Test-only override to skip real RPC and inject synthetic mid prices. */
  mockPriceSource?: (poolKey: string) => Promise<number>;
}

const DEFAULT_POOLS: SuiVaultDeepBookPoolKey[] = [
  "SUI_DBUSDC",
  "DEEP_SUI",
  "WAL_SUI",
];

const BPS_DENOM = 10_000;

export class MarketScout {
  private client: SuiClient;
  private deepbook: DeepBookClient | null = null;
  private poolKeys: string[];
  private priceHistory: Map<string, number[]> = new Map();
  private readonly historySize: number;
  private readonly minSpreadBps: number;
  private readonly volatilityBps: number;
  private readonly mockPriceSource?: (poolKey: string) => Promise<number>;
  private readonly address: string;

  /** Accept either a SuiClient/options object or a bare SuiClient for back-compat. */
  constructor(optsOrClient: MarketScoutOptions | SuiClient = {}) {
    const opts: MarketScoutOptions =
      optsOrClient && typeof (optsOrClient as any).getObject === "function" && !(optsOrClient as MarketScoutOptions).poolKeys
        ? { client: optsOrClient as SuiClient }
        : (optsOrClient as MarketScoutOptions);

    this.client =
      opts.client ??
      new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" });
    this.address = opts.address ?? "0x0";
    // DeepBook v3 needs a client with the modern `.core` API (SuiGraphQLClient).
    // If the caller passed a plain SuiClient, transparently swap it for the
    // matching GraphQL client so `.midPrice()` and friends don't crash.
    const compatible = buildCompatibleClient({ client: this.client as any, address: this.address, network: "testnet" });
    try {
      this.deepbook = createDeepBookTestnetClient(compatible, this.address);
    } catch (err) {
      // Construction can fail if the GraphQL surface isn't reachable yet.
      // We'll fall back to mockPriceSource or throw at scan time.
      this.deepbook = null;
    }
    this.poolKeys = opts.poolKeys ?? DEFAULT_POOLS;
    this.historySize = opts.historySize ?? 12;
    this.minSpreadBps = opts.minSpreadBps ?? 30; // 0.30%
    this.volatilityBps = opts.volatilityBps ?? 200; // 2.00%
    this.mockPriceSource = opts.mockPriceSource;
  }

  /** Scan all configured pools and return every detected opportunity. */
  async scanMarkets(): Promise<MarketOpportunity[]> {
    const opportunities: MarketOpportunity[] = [];

    for (const poolKey of this.poolKeys) {
      try {
        const opp = await this.scanPool(poolKey);
        if (opp) opportunities.push(opp);
      } catch (err) {
        // Surface the error in stderr but keep scanning the other pools.
        // eslint-disable-next-line no-console
        console.error(`[market-scout] ${poolKey} scan failed:`, (err as Error).message);
      }
    }

    return opportunities;
  }

  /** Scan a single pool. Returns null if no actionable event was found. */
  async scanPool(poolKey: string): Promise<MarketOpportunity | null> {
    const mid = await this.fetchMidPrice(poolKey);
    if (!Number.isFinite(mid) || mid <= 0) {
      throw new Error(`DeepBook returned non-finite mid price for ${poolKey}`);
    }

    const { baseAsset, quoteAsset } = this.poolAssets(poolKey);
    const history = this.priceHistory.get(poolKey) ?? [];
    history.push(mid);
    if (history.length > this.historySize) history.shift();
    this.priceHistory.set(poolKey, history);

    const fairValue = this.mean(history);
    const deviationBps = fairValue > 0 ? Math.abs((mid - fairValue) / fairValue) * BPS_DENOM : 0;
    const spreadBps = this.estimateSpreadBps(mid, history);

    const currentPrice = mid.toFixed(8);
    const fairValueStr = fairValue.toFixed(8);

    // 1) Volatility spike: meaningful deviation from the rolling mean.
    if (deviationBps >= this.volatilityBps) {
      const direction = mid > fairValue ? "above" : "below";
      return {
        type: "volatility",
        poolKey,
        baseAsset,
        quoteAsset,
        midPrice: mid,
        currentPrice,
        fairValue,
        fairValueString: fairValueStr,
        potentialReturn: deviationBps / 100, // percent
        riskLevel: deviationBps >= 500 ? "HIGH" : "MEDIUM",
        reason: `Volatility spike: ${deviationBps.toFixed(0)} bps ${direction} rolling mean on ${poolKey}.`,
        timestamp: Date.now(),
        recommendedAmount: BigInt(3_000_000_000), // 3 SUI, conservative
      };
    }

    // 2) Spread opportunity: rolling dispersion is wide enough to be tradable.
    if (spreadBps >= this.minSpreadBps) {
      return {
        type: "spread",
        poolKey,
        baseAsset,
        quoteAsset,
        midPrice: mid,
        currentPrice,
        fairValue,
        fairValueString: fairValueStr,
        potentialReturn: spreadBps / 100,
        riskLevel: spreadBps >= 150 ? "HIGH" : spreadBps >= 75 ? "MEDIUM" : "LOW",
        reason: `Bid-ask dispersion ${spreadBps.toFixed(0)} bps on ${poolKey} (mid ${mid.toFixed(4)}).`,
        timestamp: Date.now(),
        recommendedAmount: BigInt(5_000_000_000), // 5 SUI
      };
    }

    return null;
  }

  private async fetchMidPrice(poolKey: string): Promise<number> {
    if (this.mockPriceSource) {
      return await this.mockPriceSource(poolKey);
    }
    if (!this.deepbook) {
      throw new Error(
        `DeepBook client unavailable for ${poolKey} (no mockPriceSource and constructor failed)`
      );
    }
    // DeepBook returns a number already in human units (e.g. 1.012)
    return await this.deepbook.midPrice(poolKey);
  }

  /** Score an opportunity 0..100 (higher = better). */
  scoreOpportunity(opp: MarketOpportunity): number {
    let score = 0;

    // Return component (cap at 50 points).
    score += Math.min(50, opp.potentialReturn * 10);

    // Risk adjustment (max +30).
    if (opp.riskLevel === "LOW") score += 30;
    else if (opp.riskLevel === "MEDIUM") score += 15;
    else score += 0;

    // Type bonus.
    if (opp.type === "spread") score += 15;
    else if (opp.type === "volatility") score += 5;

    return Math.min(100, Math.round(score));
  }

  filterOpportunitiesByScore(opportunities: MarketOpportunity[], threshold = 60): MarketOpportunity[] {
    return opportunities.filter((o) => this.scoreOpportunity(o) >= threshold);
  }

  // -----------------------------------------------------------------------

  private poolAssets(poolKey: string): { baseAsset: string; quoteAsset: string } {
    const [base, quote] = poolKey.split("_");
    return { baseAsset: base ?? "?", quoteAsset: quote ?? "?" };
  }

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    let sum = 0;
    for (const v of values) sum += v;
    return sum / values.length;
  }

  /** Estimate the per-tick spread in bps using min/max dispersion in the window. */
  private estimateSpreadBps(mid: number, history: number[]): number {
    if (history.length < 2) return 0;
    let min = history[0];
    let max = history[0];
    for (const v of history) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min;
    if (mid <= 0) return 0;
    return (range / mid) * BPS_DENOM;
  }
}

export const DEFAULT_MARKET_SCOUT_POOLS = DEFAULT_POOLS;
