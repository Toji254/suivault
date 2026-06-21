export const SUIVAULT_DEEPBOOK_TESTNET = {
  defaultPoolKey: "SUI_DBUSDC",
  coins: {},
<<<<<<< HEAD
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
=======
  pools: {},
  packageIds: {},
} as const;

export type SuiVaultDeepBookPoolKey = string;
>>>>>>> 5eb793a (fix: remove deepbook dependency from vercel build)

export function createDeepBookTestnetConfig(client: unknown, address: string) {
  return {
    client,
    address,
    network: "testnet",
<<<<<<< HEAD
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
=======
  };
}

export function createDeepBookTestnetClient(client: unknown, address: string) {
  return {
    client,
    address,
    network: "testnet",
  };
}

export function getDeepBookPoolAddress(poolKey: SuiVaultDeepBookPoolKey): string {
  return poolKey;
>>>>>>> 5eb793a (fix: remove deepbook dependency from vercel build)
}
