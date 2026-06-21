import { SuiVaultClient } from "../../sdk/index";

// Owner must replace this package ID with their actual deployed package ID.
export const SUIVAULT_CONFIG = {
  packageId: "0xb1681ec32499ffc90c30d21bc7ffe8d3b160572cd25440e0ed0288a4f31bd98b",
  network: "testnet" as const,
};

export const vaultClient = new SuiVaultClient({
  packageId: SUIVAULT_CONFIG.packageId,
  network: SUIVAULT_CONFIG.network,
});
