import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { CONFIG } from "./config.js";

const owner = process.env.GLASS_OWNER || "0xf0d1230718187f66093b6787160f75a2bd36d68cde68ed4f38ec83b9660a2201";
const timeoutMs = Number(process.env.GLASS_WATCH_TIMEOUT_MS || "300000");
const pollMs = Number(process.env.GLASS_WATCH_POLL_MS || "5000");
const startedAt = Date.now();
const glassConfigPath = join(process.cwd(), "glass-agent-config.json");
const glass = existsSync(glassConfigPath) ? JSON.parse(readFileSync(glassConfigPath, "utf8")) : {};

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function tryImportDigest(client: SuiJsonRpcClient, digest: string) {
  const tx = await client.getTransactionBlock({ digest, options: { showObjectChanges: true, showEvents: true, showEffects: true } });
  if (tx.effects?.status.status !== "success") return null;
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
  if (!vaultId || !keyId || !capId) return null;
  const out = {
    vaultId,
    keyId,
    capId,
    agentAddress: glass.agentAddress,
    ownerAddress: owner,
    ownerPrivateKey: "",
    agentPrivateKey: glass.agentPrivateKey,
    whitelistedRecipient: glass.recipient || owner,
    setupDigest: digest,
    setupExplorerUrl: `https://suiscan.xyz/testnet/tx/${digest}`,
    createdAt: new Date().toISOString(),
    realTestnet: true,
    createdWithGlassWallet: true,
    packageId: CONFIG.packageId,
  };
  writeFileSync(join(process.cwd(), "demo-config.json"), JSON.stringify(out, null, 2));
  return out;
}

async function main() {
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" });
  console.log(`Watching Glass wallet ${owner} for a real SuiVault create transaction...`);
  console.log(`Timeout: ${Math.round(timeoutMs / 1000)}s`);
  while (Date.now() - startedAt < timeoutMs) {
    const page = await client.queryTransactionBlocks({
      filter: { FromAddress: owner },
      order: "descending",
      limit: 20,
      options: { showEffects: true },
    });
    for (const row of page.data) {
      const imported = await tryImportDigest(client, row.digest);
      if (imported) {
        console.log("Detected and imported Glass-wallet SuiVault create transaction.");
        console.log("Digest:", row.digest);
        console.log("Suiscan:", `https://suiscan.xyz/testnet/tx/${row.digest}`);
        console.log("Vault ID:", imported.vaultId);
        console.log("Key ID:", imported.keyId);
        console.log("Agent:", imported.agentAddress);
        return;
      }
    }
    await sleep(pollMs);
  }
  console.log("No Glass-wallet vault creation detected before timeout. Keep the create page open, sign the wallet popup, then run: npm run glass:import -- <digest>");
  process.exit(2);
}

main().catch((err) => { console.error(err); process.exit(1); });
