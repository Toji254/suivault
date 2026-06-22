export const SUIVAULT_DEEPBOOK_TESTNET = {
  defaultPoolKey: "SUI_DBUSDC",
  coins: {},
  pools: {
    SUI_DBUSDC: {
      address: "0x0",
    },
  },
  packageIds: {},
} as const;

export type SuiVaultDeepBookPoolKey = keyof typeof SUIVAULT_DEEPBOOK_TESTNET.pools;

export interface DeepBookCompatibleClient {}

export type DeepBookActionParams = {
  poolKey: SuiVaultDeepBookPoolKey | string;
  amount: bigint;
  deepAmount: bigint;
  minOut: bigint;
  quoteCoin?: unknown;
  baseCoin?: unknown;
};

export type DeepBookAction = (tx: { moveCall?: (args: unknown) => unknown[] }) => Iterable<unknown>;

export interface DeepBookClientOptions {
  client: DeepBookCompatibleClient | unknown;
  address: string;
  network: "testnet";
  coins: typeof SUIVAULT_DEEPBOOK_TESTNET.coins;
  pools: typeof SUIVAULT_DEEPBOOK_TESTNET.pools;
  packageIds: typeof SUIVAULT_DEEPBOOK_TESTNET.packageIds;
  deepBook: {
    swapExactQuoteForBase: (params: DeepBookActionParams) => DeepBookAction;
    swapExactBaseForQuote: (params: DeepBookActionParams) => DeepBookAction;
  };
}

function createNoopAction(): DeepBookAction {
  return () => [];
}

export function createDeepBookTestnetConfig(client: unknown, address: string): DeepBookClientOptions {
  return {
    client,
    address,
    network: "testnet",
    coins: SUIVAULT_DEEPBOOK_TESTNET.coins,
    pools: SUIVAULT_DEEPBOOK_TESTNET.pools,
    packageIds: SUIVAULT_DEEPBOOK_TESTNET.packageIds,
    deepBook: {
      swapExactQuoteForBase: () => createNoopAction(),
      swapExactBaseForQuote: () => createNoopAction(),
    },
  };
}

export function createDeepBookTestnetClient(client: unknown, address: string): DeepBookClientOptions {
  return createDeepBookTestnetConfig(client, address);
}

export function getDeepBookPoolAddress(poolKey: SuiVaultDeepBookPoolKey | string): string {
  const pool = (SUIVAULT_DEEPBOOK_TESTNET.pools as Record<string, { address: string }>)[poolKey];
  return pool?.address ?? "0x0";
}
