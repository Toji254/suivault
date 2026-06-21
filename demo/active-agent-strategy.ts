import { SUIVAULT_DEEPBOOK_TESTNET, getDeepBookPoolAddress } from "../sdk/deepbook.js";

export type DeepBookPoolKey = keyof typeof SUIVAULT_DEEPBOOK_TESTNET.pools;
export type HoldingCoin = "SUI";
export type TradeDirection = "baseToQuote" | "quoteToBase";

export interface SupportedPool {
  poolKey: DeepBookPoolKey;
  baseCoin: string;
  quoteCoin: string;
  address: string;
  volatile: boolean;
  note: string;
}

export interface PoolDecision extends SupportedPool {
  direction: TradeDirection;
  fromCoin: HoldingCoin;
  toCoin: string;
}

export interface PoolSelectionInput {
  policyPoolAddress: string;
  preferredPoolKeys: string[];
  holdingCoin?: HoldingCoin;
}

export interface KeyLike {
  expiresAtMs: number;
}

export interface KeyStatus {
  usable: boolean;
  reason: "active" | "expired" | "expires_soon";
}

export interface QuoteSnapshot {
  expectedOut: number;
  price: number;
  source: "deepbook-simulated-quote";
}

export interface TradeRecordInput {
  strategy: string;
  poolKey: DeepBookPoolKey;
  digest: string;
  amountMist: bigint;
  quote: QuoteSnapshot;
  timestamp: string;
}

const POOL_NOTES: Partial<Record<DeepBookPoolKey, string>> = {
  SUI_DBUSDC: "baseline SUI/stable route",
  DEEP_SUI: "volatile DEEP exposure funded with SUI quote coin",
  WAL_SUI: "volatile WAL exposure funded with SUI quote coin",
};

export const SUPPORTED_POOLS: SupportedPool[] = (Object.entries(SUIVAULT_DEEPBOOK_TESTNET.pools) as Array<[DeepBookPoolKey, any]>)
  .filter(([poolKey, pool]) => pool.baseCoin === "SUI" || pool.quoteCoin === "SUI")
  .map(([poolKey, pool]) => ({
    poolKey,
    baseCoin: pool.baseCoin,
    quoteCoin: pool.quoteCoin,
    address: getDeepBookPoolAddress(poolKey),
    volatile: poolKey !== "SUI_DBUSDC",
    note: POOL_NOTES[poolKey] || `${pool.baseCoin}/${pool.quoteCoin} route`,
  }));

export const SUPPORTED_VOLATILE_POOLS = SUPPORTED_POOLS.filter((pool) => pool.volatile);

export const DEFAULT_POOL_PREFERENCE: DeepBookPoolKey[] = ["WAL_SUI", "DEEP_SUI", "SUI_DBUSDC"];

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function classifyVaultKey(key: KeyLike, nowMs = Date.now(), renewalWindowMs = 10 * 60_000): KeyStatus {
  if (key.expiresAtMs <= nowMs) return { usable: false, reason: "expired" };
  if (key.expiresAtMs - nowMs <= renewalWindowMs) return { usable: false, reason: "expires_soon" };
  return { usable: true, reason: "active" };
}

export function selectExecutablePool(input: PoolSelectionInput): PoolDecision | null {
  const holdingCoin = input.holdingCoin || "SUI";
  const allowedAddress = normalizeAddress(input.policyPoolAddress);
  const preferred = input.preferredPoolKeys.length > 0 ? input.preferredPoolKeys : DEFAULT_POOL_PREFERENCE;

  for (const poolKey of preferred) {
    const pool = SUPPORTED_POOLS.find((candidate) => candidate.poolKey === poolKey);
    if (!pool) continue;
    if (normalizeAddress(pool.address) !== allowedAddress) continue;

    if (pool.baseCoin === holdingCoin) {
      return { ...pool, direction: "baseToQuote", fromCoin: holdingCoin, toCoin: pool.quoteCoin };
    }
    if (pool.quoteCoin === holdingCoin) {
      return { ...pool, direction: "quoteToBase", fromCoin: holdingCoin, toCoin: pool.baseCoin };
    }
  }

  return null;
}

export function parsePoolPreference(raw: string | undefined): DeepBookPoolKey[] {
  if (!raw) return DEFAULT_POOL_PREFERENCE;
  const known = new Set(SUPPORTED_POOLS.map((pool) => pool.poolKey));
  const parsed = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is DeepBookPoolKey => known.has(value as DeepBookPoolKey));
  return parsed.length > 0 ? parsed : DEFAULT_POOL_PREFERENCE;
}

export function priceToPolicyUnits(price: number): bigint {
  if (!Number.isFinite(price) || price <= 0) return 1n;
  return BigInt(Math.max(1, Math.floor(price * 1_000_000_000)));
}

export function createTradeRecord(input: TradeRecordInput) {
  const pool = SUPPORTED_POOLS.find((candidate) => candidate.poolKey === input.poolKey);
  const market = pool ? `DeepBook ${pool.baseCoin}/${pool.quoteCoin}` : `DeepBook ${input.poolKey}`;

  return {
    kind: "real_trade_executed",
    strategy: input.strategy,
    market,
    side: "spot_swap",
    status: "filled",
    amountMist: input.amountMist.toString(),
    amountSui: Number(input.amountMist) / 1_000_000_000,
    expectedOut: input.quote.expectedOut,
    quotePrice: input.quote.price,
    quoteSource: input.quote.source,
    realizedPnlSui: null,
    pnlStatus: "pending_close_or_fill_indexing",
    digest: input.digest,
    explorerUrl: `https://suiscan.xyz/testnet/tx/${input.digest}`,
    label: `${input.strategy}: executed ${market}; PnL pending until close/fill accounting is indexed`,
    timestamp: input.timestamp,
  };
}
