import { SuiVaultClient } from "../sdk/client.js";
try {
  const c = new SuiVaultClient({
    packageId: "0xb1681ec32499ffc90c30d21bc7ffe8d3b160572cd25440e0ed0288a4f31bd98b",
    network: "testnet",
  });
  const tx = c.buildGuardedDeepBookSwap({
    vaultId: "0xv",
    keyId: "0xk",
    amount: 5_000_000_000n,
    poolKey: "SUI_DBUSDC",
    limitPrice: 0n,
    minOut: 0n,
    agentAddress: "0x".padEnd(66, "0"),
    recipient: "0x".padEnd(66, "0"),
    walrusBlobId: "walrus-x",
  });
  console.log("PTB build ok, constructor:", tx.constructor.name);
} catch (e: any) {
  console.error("Build failed:", e.message);
  console.error(e.stack);
}