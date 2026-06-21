import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { SuiVaultClient } from "../sdk/client.js";
import { CONFIG } from "./config.js";

async function main() {
  const args = process.argv.slice(2);
  const action = args[0]?.toLowerCase();

  if (action !== "freeze" && action !== "unfreeze") {
    console.log("Usage: npx tsx owner-actions.ts <freeze|unfreeze>");
    process.exit(1);
  }

  if (!CONFIG.vaultId || !CONFIG.ownerPrivateKey) {
    console.error("❌ Error: Config missing. Run setup first.");
    process.exit(1);
  }

  const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(CONFIG.network) });
  const vaultClient = new SuiVaultClient({
    packageId: CONFIG.packageId,
    network: CONFIG.network,
  });

  const ownerKeypair = Ed25519Keypair.fromSecretKey(CONFIG.ownerPrivateKey);

  if (action === "freeze") {
    console.log(`❄️  Freezing vault ${CONFIG.vaultId}...`);
    const tx = vaultClient.buildFreezeVault(CONFIG.vaultId, CONFIG.capId);
    const res = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: ownerKeypair,
    });
    console.log(`✅ Frozen! Tx digest: ${res.digest}`);
  } else {
    console.log(`☀️  Unfreezing vault ${CONFIG.vaultId}...`);
    const tx = vaultClient.buildUnfreezeVault(CONFIG.vaultId, CONFIG.capId);
    const res = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: ownerKeypair,
    });
    console.log(`✅ Unfrozen! Tx digest: ${res.digest}`);
  }
}

main().catch((err) => {
  console.error("❌ Owner action failed:", err);
});
