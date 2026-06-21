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

export interface DeepBookClientOptions {
  client: DeepBookCompatibleClient | unknown;
  address: string;
  network: "testnet";
  coins: typeof SUIVAULT_DEEPBOOK_TESTNET.coins;
  pools: typeof SUIVAULT_DEEPBOOK_TESTNET.pools;
  packageIds: typeof SUIVAULT_DEEPBOOK_TESTNET.packageIds;
}

export function createDeepBookTestnetConfig(client: unknown, address: string): DeepBookClientOptions {
  return {
    client,
    address,
    network: "testnet",
    coins: SUIVAULT_DEEPBOOK_TESTNET.coins,
    pools: SUIVAULT_DEEPBOOK_TESTNET.pools,
    packageIds: SUIVAULT_DEEPBOOK_TESTNET.packageIds,
  };
}

export function createDeepBookTestnetClient(client: unknown, address: string) {
  return createDeepBookTestnetConfig(client, address);
}

export function getDeepBookPoolAddress(poolKey: SuiVaultDeepBookPoolKey | string): string {
  const pool = (SUIVAULT_DEEPBOOK_TESTNET.pools as Record<string, { address: string }>)[poolKey];
  return pool?.address ?? "0x0";
}
