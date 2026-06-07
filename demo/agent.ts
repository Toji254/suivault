import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import chalk from "chalk";
import { SuiVaultClient, parseVaultError, mistToSui } from "../sdk/client.js";
import { CONFIG } from "./config.js";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // Check if configuration exists
  if (!CONFIG.vaultId || !CONFIG.agentPrivateKey || !CONFIG.ownerPrivateKey) {
    console.error(
      chalk.red(
        "❌ Error: Config parameters missing. Please run the setup script first:\n" +
          "   npm run setup"
      )
    );
    process.exit(1);
  }

  const suiClient = new SuiClient({ url: getFullnodeUrl(CONFIG.network) });
  const vaultClient = new SuiVaultClient({
    packageId: CONFIG.packageId,
    network: CONFIG.network,
  });

  // Re-create keypairs from private keys
  const agentKeypair = Ed25519Keypair.fromSecretKey(CONFIG.agentPrivateKey);
  const ownerKeypair = Ed25519Keypair.fromSecretKey(CONFIG.ownerPrivateKey);
  const badKeypair = new Ed25519Keypair();

  const vaultId = CONFIG.vaultId;
  const keyId = CONFIG.keyId;
  const capId = CONFIG.capId;
  const whitelistAddr = CONFIG.whitelistedRecipient;
  const randomAddr = badKeypair.toSuiAddress();

  // Print Header
  console.clear();
  console.log(chalk.cyan("╔══════════════════════════════════════════════════════════╗"));
  console.log(chalk.cyan("║  🤖 SuiVault Demo Agent — DeFi Trading Bot             ║"));
  console.log(chalk.cyan("╠══════════════════════════════════════════════════════════╣"));
  console.log(
    chalk.cyan(`║  Vault:  ${vaultId.substring(0, 10)}...${vaultId.substring(vaultId.length - 8)}               ║`)
  );
  console.log(
    chalk.cyan(`║  Key:    ${keyId.substring(0, 10)}...${keyId.substring(keyId.length - 8)}               ║`)
  );
  console.log(chalk.cyan("║  Policy: 0.1 SUI/tx · 0.3 SUI/day · 1 whitelisted addr  ║"));
  console.log(chalk.cyan("╚══════════════════════════════════════════════════════════╝"));
  console.log("");

  let approvedCount = 0;
  let blockedCount = 0;
  let totalSuiApproved = 0.0;
  let limitViolations = 0;
  let whitelistViolations = 0;
  let freezeViolations = 0;

  async function getVaultDetails() {
    const v = await vaultClient.getVault(vaultId);
    if (!v) return { balanceStr: "0.0000 SUI", dailyStr: "0.0/0.3 SUI" };
    return {
      balanceStr: `${mistToSui(v.balance)} SUI`,
      dailyStr: `${mistToSui(v.todaySpent)}/0.3 SUI`,
    };
  }

  // ==========================================================================
  // SCENARIO 1: ✅ Successful Trade
  // ==========================================================================
  console.log(chalk.grey("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.yellow("🔄 [Trade 1/6] Swapping 0.02 SUI → whitelisted address"));
  console.log(`   📋 Amount: 0.02 SUI (limit: 0.1 SUI)  ${chalk.green("✅")}`);
  console.log(`   📋 Recipient: ${whitelistAddr.substring(0, 10)}...  ${chalk.green("✅ whitelisted")}`);

  try {
    const amount = 20_000_000n; // 0.02 SUI
    const tx = vaultClient.buildSpend(vaultId, keyId, amount, whitelistAddr);
    const start = Date.now();
    const result = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: agentKeypair,
      options: { showEffects: true },
    });

    if (result.effects?.status.status === "failure") {
      throw new Error(result.effects.status.error);
    }

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(chalk.green(`   ✅ APPROVED — TX: ${result.digest} (${duration}s)`));
    approvedCount++;
    totalSuiApproved += 0.02;
  } catch (error: any) {
    handleTxError(error);
  }

  let stats = await getVaultDetails();
  console.log(chalk.blue(`   💰 Vault Balance: ${stats.balanceStr} │ Daily Spent: ${stats.dailyStr}`));
  await delay(3000);

  // ==========================================================================
  // SCENARIO 2: ❌ Blocked — Over Per-TX Limit
  // ==========================================================================
  console.log(chalk.grey("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.yellow("🔄 [Trade 2/6] Swapping 0.25 SUI → whitelisted address"));
  console.log(`   📋 Amount: 0.25 SUI (limit: 0.1 SUI)  ${chalk.red("❌ OVER LIMIT")}`);

  try {
    const amount = 250_000_000n; // 0.25 SUI
    const tx = vaultClient.buildSpend(vaultId, keyId, amount, whitelistAddr);
    await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: agentKeypair,
    });
    console.log(chalk.red("   ⚠️ Approved?! (Bug in contract)"));
  } catch (error: any) {
    const handled = handleTxError(error);
    if (handled) limitViolations++;
    blockedCount++;
  }

  stats = await getVaultDetails();
  console.log(chalk.blue(`   💰 Vault Balance: ${stats.balanceStr} │ Daily Spent: ${stats.dailyStr} (unchanged)`));
  await delay(3000);

  // ==========================================================================
  // SCENARIO 3: ❌ Blocked — Unauthorized Recipient
  // ==========================================================================
  console.log(chalk.grey("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.yellow("🔄 [Trade 3/6] Swapping 0.01 SUI → random recipient address"));
  console.log(`   📋 Amount: 0.01 SUI (limit: 0.1 SUI)  ${chalk.green("✅")}`);
  console.log(`   📋 Recipient: ${randomAddr.substring(0, 10)}...  ${chalk.red("❌ NOT WHITELISTS")}`);

  try {
    const amount = 10_000_000n; // 0.01 SUI
    const tx = vaultClient.buildSpend(vaultId, keyId, amount, randomAddr);
    await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: agentKeypair,
    });
    console.log(chalk.red("   ⚠️ Approved?! (Bug in contract)"));
  } catch (error: any) {
    const handled = handleTxError(error);
    if (handled) whitelistViolations++;
    blockedCount++;
  }

  stats = await getVaultDetails();
  console.log(chalk.blue(`   💰 Vault Balance: ${stats.balanceStr} │ Daily Spent: ${stats.dailyStr} (unchanged)`));
  await delay(3000);

  // ==========================================================================
  // SCENARIO 4: ✅ Another Successful Trade
  // ==========================================================================
  console.log(chalk.grey("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.yellow("🔄 [Trade 4/6] Swapping 0.05 SUI → whitelisted address"));
  console.log(`   📋 Amount: 0.05 SUI (limit: 0.1 SUI)  ${chalk.green("✅")}`);
  console.log(`   📋 Recipient: ${whitelistAddr.substring(0, 10)}...  ${chalk.green("✅ whitelisted")}`);

  try {
    const amount = 50_000_000n; // 0.05 SUI
    const tx = vaultClient.buildSpend(vaultId, keyId, amount, whitelistAddr);
    const start = Date.now();
    const result = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: agentKeypair,
    });
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(chalk.green(`   ✅ APPROVED — TX: ${result.digest} (${duration}s)`));
    approvedCount++;
    totalSuiApproved += 0.05;
  } catch (error: any) {
    handleTxError(error);
  }

  stats = await getVaultDetails();
  console.log(chalk.blue(`   💰 Vault Balance: ${stats.balanceStr} │ Daily Spent: ${stats.dailyStr}`));
  await delay(3000);

  // ==========================================================================
  // SCENARIO 5: 🔴 Owner Freeze (Automated)
  // ==========================================================================
  console.log(chalk.grey("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.red("🚨 [Owner Actions] Freezing Vault (Kill Switch Triggered)..."));
  try {
    const freezeTx = vaultClient.buildFreezeVault(vaultId, capId);
    await suiClient.signAndExecuteTransaction({
      transaction: freezeTx,
      signer: ownerKeypair,
    });
    console.log(chalk.red("   ❄️  Vault Frozen Successfully!"));
  } catch (e) {
    console.error("   ❌ Failed to freeze vault:", e);
  }

  console.log(chalk.yellow("🔄 [Trade 5/6] Swapping 0.01 SUI → whitelisted address"));
  console.log(`   📋 Amount: 0.01 SUI (limit: 0.1 SUI)  ${chalk.green("✅")}`);
  console.log("   📋 Vault State: FROZEN ❄️");

  try {
    const amount = 10_000_000n; // 0.01 SUI
    const tx = vaultClient.buildSpend(vaultId, keyId, amount, whitelistAddr);
    await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: agentKeypair,
    });
    console.log(chalk.red("   ⚠️ Approved?! (Bug in contract)"));
  } catch (error: any) {
    const handled = handleTxError(error);
    if (handled) freezeViolations++;
    blockedCount++;
  }

  stats = await getVaultDetails();
  console.log(chalk.blue(`   💰 Vault Balance: ${stats.balanceStr} │ Daily Spent: ${stats.dailyStr} (unchanged)`));
  await delay(3000);

  // ==========================================================================
  // SCENARIO 6: 🟢 Owner Unfreeze & Spend (Automated)
  // ==========================================================================
  console.log(chalk.grey("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.green("☀️  [Owner Actions] Unfreezing Vault (Resuming Operations)..."));
  try {
    const unfreezeTx = vaultClient.buildUnfreezeVault(vaultId, capId);
    await suiClient.signAndExecuteTransaction({
      transaction: unfreezeTx,
      signer: ownerKeypair,
    });
    console.log(chalk.green("   ☀️  Vault Unfrozen Successfully!"));
  } catch (e) {
    console.error("   ❌ Failed to unfreeze vault:", e);
  }

  console.log(chalk.yellow("🔄 [Trade 6/6] Swapping 0.03 SUI → whitelisted address"));
  console.log(`   📋 Amount: 0.03 SUI (limit: 0.1 SUI)  ${chalk.green("✅")}`);

  try {
    const amount = 30_000_000n; // 0.03 SUI
    const tx = vaultClient.buildSpend(vaultId, keyId, amount, whitelistAddr);
    const start = Date.now();
    const result = await suiClient.signAndExecuteTransaction({
      transaction: tx,
      signer: agentKeypair,
    });
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(chalk.green(`   ✅ APPROVED — TX: ${result.digest} (${duration}s)`));
    approvedCount++;
    totalSuiApproved += 0.03;
  } catch (error: any) {
    handleTxError(error);
  }

  stats = await getVaultDetails();
  console.log(chalk.blue(`   💰 Vault Balance: ${stats.balanceStr} │ Daily Spent: ${stats.dailyStr}`));
  await delay(2000);

  // ==========================================================================
  // DEMO SUMMARY
  // ==========================================================================
  console.log(chalk.grey("=============================================================="));
  console.log(chalk.cyan("📊 Demo Summary"));
  console.log(chalk.grey("=============================================================="));
  console.log(`   Total Trades Attempted:  ${chalk.white("6")}`);
  console.log(`   ✅ Approved:             ${chalk.green(approvedCount.toString())}  (${totalSuiApproved.toFixed(2)} SUI total)`);
  console.log(`   ❌ Blocked:              ${chalk.red(blockedCount.toString())}`);
  console.log(`      - Per-TX limit:       ${chalk.red(limitViolations.toString())}`);
  console.log(`      - Bad recipient:      ${chalk.red(whitelistViolations.toString())}`);
  console.log(`      - Vault frozen:       ${chalk.red(freezeViolations.toString())}`);
  console.log(`   💰 Final Balance:        ${chalk.green(stats.balanceStr)}`);
  console.log(chalk.grey("=============================================================="));
}

function handleTxError(error: any): boolean {
  const errorMsg = error.message || String(error);
  const match = errorMsg.match(/MoveAbort.*?(\d+)\)/);
  if (match) {
    const code = parseInt(match[1]);
    console.log(chalk.red(`   ❌ BLOCKED — ${parseVaultError(code)}`));
    return true;
  } else {
    console.log(chalk.red(`   ❌ FAILED — ${errorMsg}`));
    return false;
  }
}

main().catch((err) => {
  console.error("❌ Fatal agent error:", err);
});
