import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { requestSuiFromFaucetV0, getFaucetHost } from "@mysten/sui/faucet";
import { writeFileSync } from "fs";
import { join } from "path";
import { SuiVaultClient } from "../sdk/client.js";
import { CONFIG } from "./config.js";

async function main() {
  console.log("🚀 Starting SuiVault Demo Setup...");

  if (CONFIG.packageId === "PACKAGE_ID" || !CONFIG.packageId.startsWith("0x")) {
    console.error("❌ Error: Please publish the smart contract and update `packageId` in `demo/config.ts` first!");
    process.exit(1);
  }

  const suiClient = new SuiClient({ url: getFullnodeUrl(CONFIG.network) });
  const vaultClient = new SuiVaultClient({
    packageId: CONFIG.packageId,
    network: CONFIG.network,
  });

  // 1. Generate Keypairs
  console.log("🔑 Generating keypairs...");
  const ownerKeypair = new Ed25519Keypair();
  const agentKeypair = new Ed25519Keypair();
  const recipientKeypair = new Ed25519Keypair();

  const ownerAddress = ownerKeypair.toSuiAddress();
  const agentAddress = agentKeypair.toSuiAddress();
  const recipientAddress = recipientKeypair.toSuiAddress();

  console.log(`   Owner address:     ${ownerAddress}`);
  console.log(`   Agent address:     ${agentAddress}`);
  console.log(`   Recipient address: ${recipientAddress}`);

  // 2. Request SUI from Faucet
  console.log("🚰 Requesting testnet SUI from faucet for Owner & Agent...");
  try {
    const faucetHost = getFaucetHost(CONFIG.network);
    console.log("   Funding Owner...");
    await requestSuiFromFaucetV0({
      host: faucetHost,
      recipient: ownerAddress,
    });
    console.log("   Funding Agent...");
    await requestSuiFromFaucetV0({
      host: faucetHost,
      recipient: agentAddress,
    });
    console.log("   Faucet funding complete! Waiting for transactions to index...");
    await new Promise((r) => setTimeout(r, 6000));
  } catch (e) {
    console.error("❌ Faucet request failed:", e);
    console.log("⚠️  Please fund the addresses manually if needed and re-run.");
  }

  // Check balances
  const ownerBalance = await suiClient.getBalance({ owner: ownerAddress });
  console.log(`   Owner Balance: ${Number(ownerBalance.totalBalance) / 1_000_000_000} SUI`);

  if (BigInt(ownerBalance.totalBalance) === 0n) {
    console.error("❌ Owner has no SUI to execute vault creation. Exiting.");
    process.exit(1);
  }

  // 3. Find Coin for deposit
  console.log("🔍 Locating SUI Coin for vault deposit...");
  const coins = await suiClient.getCoins({ owner: ownerAddress, coinType: "0x2::sui::SUI" });
  if (coins.data.length === 0) {
    console.error("❌ No coins found for owner to deposit. Exiting.");
    process.exit(1);
  }
  const depositCoin = coins.data[0];
  console.log(`   Selected Coin: ${depositCoin.coinObjectId} (${Number(depositCoin.balance) / 1_000_000_000} SUI)`);

  // 4. Create Vault
  console.log("📦 Creating Vault and issuing VaultKey...");
  // We'll deposit 0.5 SUI (500,000,000 MIST)
  const depositAmount = 500_000_000n;
  const maxPerTx = 100_000_000n; // 0.1 SUI
  const maxPerDay = 300_000_000n; // 0.3 SUI
  const durationMs = 24 * 60 * 60 * 1000; // 24 Hours

  const tx = vaultClient.buildCreateVault({
    coinObjectId: depositCoin.coinObjectId,
    name: "DeFi Trading Vault",
    agentAddress: agentAddress,
    agentName: "Agent-007",
    keyDurationMs: durationMs,
    policy: {
      maxPerTx,
      maxPerDay,
      allowedRecipients: [recipientAddress],
      activeHoursStart: 0,
      activeHoursEnd: 0, // no restrictions
      isDeepbookOnly: false,
      deepbookPool: "",
      maxPrice: 0n,
      minPrice: 0n,
    },
    depositAmount, // note: move call takes the coin directly so depositAmount is implicit in the coin object value
  });

  const result = await suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: ownerKeypair,
    options: {
      showEvents: true,
      showEffects: true,
    },
  });

  console.log("   Tx executed! Digest:", result.digest);

  // 5. Parse IDs
  let vaultId = "";
  let keyId = "";
  let capId = "";

  const events = result.events || [];
  for (const event of events) {
    if (event.type.endsWith("::vault::VaultCreated")) {
      vaultId = (event.parsedJson as any).vault_id;
    } else if (event.type.endsWith("::vault::KeyIssued")) {
      keyId = (event.parsedJson as any).key_id;
    }
  }

  // Find VaultOwnerCap object owned by owner
  const ownedObjects = await suiClient.getOwnedObjects({
    owner: ownerAddress,
    filter: { StructType: `${CONFIG.packageId}::vault::VaultOwnerCap` },
  });
  if (ownedObjects.data.length > 0) {
    capId = ownedObjects.data[0].data?.objectId || "";
  }

  if (!vaultId || !keyId || !capId) {
    console.error("❌ Failed to parse all IDs from transaction:", { vaultId, keyId, capId });
    process.exit(1);
  }

  console.log("✅ Vault Setup Successful!");
  console.log(`   Vault ID:     ${vaultId}`);
  console.log(`   Key ID:       ${keyId}`);
  console.log(`   Cap ID:       ${capId}`);

  // 6. Save Configuration to JSON
  const demoConfig = {
    vaultId,
    keyId,
    capId,
    agentAddress,
    ownerAddress,
    ownerPrivateKey: ownerKeypair.getSecretKey(),
    agentPrivateKey: agentKeypair.getSecretKey(),
    whitelistedRecipient: recipientAddress,
  };

  const configPath = join(process.cwd(), "demo", "demo-config.json");
  writeFileSync(configPath, JSON.stringify(demoConfig, null, 2));
  console.log(`💾 Saved configuration parameters to ${configPath}`);
}

main().catch((err) => {
  console.error("❌ Error in main setup execution:", err);
});
