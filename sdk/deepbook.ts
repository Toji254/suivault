import {
  DeepBookClient,
  type DeepBookClientOptions,
  type DeepBookCompatibleClient,
  testnetCoins,
  testnetPackageIds,
  testnetPools,
} from "@mysten/deepbook-v3";

export const SUIVAULT_DEEPBOOK_TESTNET = {
  defaultPoolKey: "SUI_DBUSDC",
  coins: testnetCoins,
  pools: testnetPools,
  packageIds: testnetPackageIds,
} as const;

export type SuiVaultDeepBookPoolKey = keyof typeof testnetPools;

export function createDeepBookTestnetConfig(
  client: DeepBookCompatibleClient,
  address: string,
): DeepBookClientOptions {
  return {
    client,
    address,
    network: "testnet",
    coins: testnetCoins,
    pools: testnetPools,
    packageIds: testnetPackageIds,
  };
}

export function createDeepBookTestnetClient(client: DeepBookCompatibleClient, address: string): DeepBookClient {
  return new DeepBookClient(createDeepBookTestnetConfig(client, address));
}

export function getDeepBookPoolAddress(poolKey: SuiVaultDeepBookPoolKey | string): string {
  const pool = (testnetPools as Record<string, { address: string }>)[poolKey];
  if (!pool?.address) {
    throw new Error(`Unknown DeepBook testnet pool key: ${poolKey}`);
  }
  return pool.address;
}
