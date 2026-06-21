import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { CONFIG } from "./config.js";

const MIST_PER_SUI = 1_000_000_000n;
const DEFAULT_OWNER_ADDRESS = "0x142df8eaa1bfa7554bc9a71d9105f5a4b039e66ea5e55ea4b38bcb83cb684dc0";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000000000000000000000000000";

function suiToMist(value: string): bigint {
  const [wholeRaw, fracRaw = ""] = value.split(".");
  const whole = BigInt(wholeRaw || "0") * MIST_PER_SUI;
  const frac = BigInt((fracRaw + "000000000").slice(0, 9));
  return whole + frac;
}

function loadSuiCliKeypair(expectedAddress?: string): Ed25519Keypair {
  const keyPath = process.env.SUI_KEYSTORE || join(homedir(), ".sui", "sui_config", "sui.keystore");
  if (!existsSync(keyPath)) {
    throw new Error(`Sui CLI keystore not found at ${keyPath}. Run sui client first or set SUI_KEYSTORE.`);
  }

  const entries = JSON.parse(readFileSync(keyPath, "utf8")) as string[];
  for (const entry of entries) {
    const bytes = Buffer.from(entry, "base64");
    if (bytes.length !== 33 || bytes[0] !== 0) continue; // Ed25519 in Sui keystore: flag byte + 32-byte secret
    const keypair = Ed25519Keypair.fromSecretKey(bytes.subarray(1));
    if (!expectedAddress || keypair.toSuiAddress().toLowerCase() === expectedAddress.toLowerCase()) {
      return keypair;
    }
  }

  throw new Error(`No Ed25519 key for ${expectedAddress || "the active address"} was found in ${keyPath}.`);
}

async function waitForTx(client: SuiJsonRpcClient, digest: string) {
  await client.waitForTransaction({ digest, timeout: 60_000 });
}

async function main() {
  console.log("🚀 Starting REAL SuiVault Testnet Setup...");

  if (CONFIG.packageId === "PACKAGE_ID" || !CONFIG.packageId.startsWith("0x")) {
    throw new Error("Please publish the smart contract and update packageId in demo/config.ts first.");
  }

  const network = CONFIG.network;
  const suiClient = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(network) });
  const ownerAddress = process.env.SUI_OWNER_ADDRESS || DEFAULT_OWNER_ADDRESS;
  const ownerKeypair = loadSuiCliKeypair(ownerAddress);
  const agentKeypair = new Ed25519Keypair();
  const recipientKeypair = new Ed25519Keypair();

  const agentAddress = agentKeypair.toSuiAddress();
  const recipientAddress = recipientKeypair.toSuiAddress();

  const depositAmount = suiToMist(process.env.DEMO_REAL_DEPOSIT_SUI || "0.07");
  const agentGasAmount = suiToMist(process.env.DEMO_REAL_AGENT_GAS_SUI || "0.035");
  const maxPerTx = suiToMist(process.env.DEMO_REAL_MAX_PER_TX_SUI || "0.05");
  const maxPerDay = suiToMist(process.env.DEMO_REAL_MAX_PER_DAY_SUI || "0.15");
  const durationMs = 24 * 60 * 60 * 1000;

  console.log(`   Owner address:     ${ownerAddress}`);
  console.log(`   Agent address:     ${agentAddress}`);
  console.log(`   Recipient address: ${recipientAddress}`);
  console.log(`   Package ID:        ${CONFIG.packageId}`);
  console.log(`   Deposit:           ${Number(depositAmount) / 1_000_000_000} SUI`);
  console.log(`   Agent gas:         ${Number(agentGasAmount) / 1_000_000_000} SUI`);

  const balance = await suiClient.getBalance({ owner: ownerAddress });
  const gasBuffer = suiToMist(process.env.DEMO_REAL_GAS_BUFFER_SUI || "0.035");
  const required = depositAmount + agentGasAmount + gasBuffer;
  console.log(`   Owner balance:     ${Number(balance.totalBalance) / 1_000_000_000} SUI`);
  if (BigInt(balance.totalBalance) < required) {
    throw new Error(`Owner needs at least ${Number(required) / 1_000_000_000} SUI for deposit + agent gas + transaction gas buffer.`);
  }

  console.log("📦 Creating vault, issuing VaultKey, and funding agent gas in one real testnet transaction...");
  const tx = new Transaction();
  tx.setSender(ownerAddress);
  const [depositCoin, agentGasCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(depositAmount), tx.pure.u64(agentGasAmount)]);
  tx.moveCall({
    target: `${CONFIG.packageId}::vault::create_vault_entry`,
    typeArguments: ["0x2::sui::SUI"],
    arguments: [
      depositCoin,
      tx.pure.string("SuiVault Real Testnet Demo Vault"),
      tx.pure.address(agentAddress),
      tx.pure.string("Real Testnet Agent"),
      tx.pure.u64(durationMs),
      tx.pure.u64(maxPerTx),
      tx.pure.u64(maxPerDay),
      tx.pure.vector("address", [recipientAddress]),
      tx.pure.u8(0),
      tx.pure.u8(0),
      tx.pure.bool(false),
      tx.pure.address(ZERO_ADDRESS),
      tx.pure.u64(0),
      tx.pure.u64(0),
      tx.object("0x6"),
    ],
  });
  tx.transferObjects([agentGasCoin], tx.pure.address(agentAddress));
  tx.setGasBudget(40_000_000);

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: ownerKeypair,
    options: { showEvents: true, showEffects: true, showObjectChanges: true },
  });
  await waitForTx(suiClient, result.digest);
  console.log("   ✅ Real setup tx digest:", result.digest);
  console.log(`   🔎 Suiscan: https://suiscan.xyz/testnet/tx/${result.digest}`);

  let vaultId = "";
  let keyId = "";
  let capId = "";
  for (const event of result.events || []) {
    if (event.type.endsWith("::vault::VaultCreated")) vaultId = (event.parsedJson as any).vault_id;
    if (event.type.endsWith("::vault::KeyIssued")) keyId = (event.parsedJson as any).key_id;
  }
  for (const change of result.objectChanges || []) {
    if (change.type === "created" && change.objectType?.endsWith("::vault::VaultOwnerCap")) capId = change.objectId;
  }

  if (!vaultId || !keyId || !capId) {
    throw new Error(`Failed to parse setup object IDs: ${JSON.stringify({ vaultId, keyId, capId })}`);
  }

  const demoConfig = {
    vaultId,
    keyId,
    capId,
    agentAddress,
    ownerAddress,
    ownerPrivateKey: ownerKeypair.getSecretKey(),
    agentPrivateKey: agentKeypair.getSecretKey(),
    whitelistedRecipient: recipientAddress,
    setupDigest: result.digest,
    setupExplorerUrl: `https://suiscan.xyz/testnet/tx/${result.digest}`,
    createdAt: new Date().toISOString(),
    realTestnet: true,
  };

  const configPath = join(process.cwd(), "demo-config.json");
  writeFileSync(configPath, JSON.stringify(demoConfig, null, 2));
  console.log("✅ Real SuiVault setup complete.");
  console.log(`   Vault ID: ${vaultId}`);
  console.log(`   Key ID:   ${keyId}`);
  console.log(`   Cap ID:   ${capId}`);
  console.log(`💾 Saved real demo config to ${configPath}`);
}

main().catch((err) => {
  console.error("❌ Real setup failed:", err);
  process.exit(1);
});
