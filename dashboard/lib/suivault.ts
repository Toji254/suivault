import { SuiVaultClient } from "../../sdk/index";

// Owner must replace this package ID with their actual deployed package ID.
export const SUIVAULT_CONFIG = {
  packageId: "0x76e4f4311ea9c7cafeb45ad5817e784887e7021ac4595b3e6baf514cf3e725b9",
  network: "testnet" as const,
};

export const vaultClient = new SuiVaultClient({
  packageId: SUIVAULT_CONFIG.packageId,
  network: SUIVAULT_CONFIG.network,
});
