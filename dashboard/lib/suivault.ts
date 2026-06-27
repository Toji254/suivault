import { Transaction } from "@mysten/sui/transactions";
import { SuiVaultClient } from "../../sdk/index";
import type { CreateVaultParams } from "../../sdk/types";

// Owner must replace this package ID with their actual deployed package ID.
export const SUIVAULT_CONFIG = {
  packageId: "0xb1681ec32499ffc90c30d21bc7ffe8d3b160572cd25440e0ed0288a4f31bd98b",
  network: "testnet" as const,
};

export const vaultClient = new SuiVaultClient({
  packageId: SUIVAULT_CONFIG.packageId,
  network: SUIVAULT_CONFIG.network,
});

// The SDK currently ships with a lightweight mock Transaction class for demos.
// Wallet adapters need a real @mysten/sui Transaction object, otherwise signing
// can fail with errors like `e.toJSON is not a function`.
(vaultClient as any).buildCreateVault = function buildCreateVault(params: CreateVaultParams) {
  const tx = new Transaction();

  const [depositCoin] = tx.splitCoins(tx.object(params.coinObjectId), [
    tx.pure.u64(params.depositAmount),
  ]);

  tx.moveCall({
    target: `${this.packageId}::vault::create_vault_entry`,
    typeArguments: [this.coinType],
    arguments: [
      depositCoin,
      tx.pure.string(params.name),
      tx.pure.address(params.agentAddress),
      tx.pure.string(params.agentName),
      tx.pure.u64(params.keyDurationMs),
      tx.pure.u64(params.policy.maxPerTx),
      tx.pure.u64(params.policy.maxPerDay),
      tx.pure.vector(
        "address",
        params.policy.allowedRecipients.map((recipient: string) => recipient),
      ),
      tx.pure.u8(params.policy.activeHoursStart),
      tx.pure.u8(params.policy.activeHoursEnd),
      tx.pure.bool(params.policy.isDeepbookOnly),
      tx.pure.address(
        params.policy.deepbookPool ||
          "0x0000000000000000000000000000000000000000000000000000000000000000",
      ),
      tx.pure.u64(params.policy.maxPrice),
      tx.pure.u64(params.policy.minPrice),
      tx.object("0x6"),
    ],
  });

  return tx;
};
