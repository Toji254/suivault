import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { CONFIG } from "./config.js";

const digestArg = process.argv[2] || process.env.GLASS_CREATE_DIGEST;
if (!digestArg) {
  throw new Error("Usage: npm run glass:import -- <create-vault-tx-digest>");
}
const digest: string = digestArg;

const glassConfigPath = join(process.cwd(), "glass-agent-config.json");
if (!existsSync(glassConfigPath)) {
  console.error(`Missing ${glassConfigPath}. Run npm run glass:prepare first.`);
  process.exit(1);
}
const glass = JSON.parse(readFileSync(glassConfigPath, "utf8"));

async function main() {
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" });
  const tx = await client.getTransactionBlock({
    digest,
    options: { showObjectChanges: true, showEvents: true, showEffects: true },
  });
  if (tx.effects?.status.status === "failure") {
    throw new Error(`Transaction failed on-chain: ${tx.effects.status.error}`);
  }

  let vaultId = "";
  let keyId = "";
  let capId = "";

  for (const event of tx.events || []) {
    if (event.type.endsWith("::vault::VaultCreated")) vaultId = (event.parsedJson as any).vault_id;
    if (event.type.endsWith("::vault::KeyIssued")) keyId = (event.parsedJson as any).key_id;
  }

  for (const change of tx.objectChanges || []) {
    if (change.type === "created" && change.objectType?.includes("::vault::VaultOwnerCap")) capId = change.objectId;
    if (!vaultId && change.type === "created" && change.objectType?.includes("::vault::Vault<")) vaultId = change.objectId;
    if (!keyId && change.type === "created" && change.objectType?.includes("::vault::VaultKey")) keyId = change.objectId;
  }

  if (!vaultId || !keyId || !capId) {
    throw new Error(`Could not parse vault/key/cap IDs from digest ${digest}: ${JSON.stringify({ vaultId, keyId, capId })}`);
  }

  const demoConfig = {
    vaultId,
    keyId,
    capId,
    agentAddress: glass.agentAddress,
    ownerAddress: glass.ownerAddress,
    ownerPrivateKey: "",
    agentPrivateKey: glass.agentPrivateKey,
    whitelistedRecipient: glass.recipient || glass.ownerAddress,
    setupDigest: digest,
    setupExplorerUrl: `https://suiscan.xyz/testnet/tx/${digest}`,
    createdAt: new Date().toISOString(),
    realTestnet: true,
    createdWithGlassWallet: true,
    packageId: CONFIG.packageId,
  };

  const out = join(process.cwd(), "demo-config.json");
  writeFileSync(out, JSON.stringify(demoConfig, null, 2));
  console.log("Imported real Glass-wallet vault into demo-config.json");
  console.log("Vault ID:", vaultId);
  console.log("Key ID:", keyId);
  console.log("Owner cap ID:", capId);
  console.log("Agent:", glass.agentAddress);
  console.log("Suiscan:", demoConfig.setupExplorerUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
