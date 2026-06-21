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
  client: DeepBookCompatibleClient;
  address: string;
  network: "testnet";
  coins: typeof SUIVAULT_DEEPBOOK_TESTNET.coins;
  pools: typeof SUIVAULT_DEEPBOOK_TESTNET.pools;
  packageIds: typeof SUIVAULT_DEEPBOOK_TESTNET.packageIds;
}

export function createDeepBookTestnetConfig(
  client: DeepBookCompatibleClient,
  address: string,
): DeepBookClientOptions {
  return {
    client,
    address,
    network: "testnet",
    coins: SUIVAULT_DEEPBOOK_TESTNET.coins,
    pools: SUIVAULT_DEEPBOOK_TESTNET.pools,
    packageIds: SUIVAULT_DEEPBOOK_TESTNET.packageIds,
  };
}

export function createDeepBookTestnetClient(client: DeepBookCompatibleClient, address: string) {
  return createDeepBookTestnetConfig(client, address);
}

export function getDeepBookPoolAddress(poolKey: SuiVaultDeepBookPoolKey | string): string {
  const pool = (SUIVAULT_DEEPBOOK_TESTNET.pools as Record<string, { address: string }>)[poolKey];
  if (!pool?.address) {
    throw new Error(`Unknown DeepBook testnet pool key: ${poolKey}`);
  }
  return pool.address;
}
