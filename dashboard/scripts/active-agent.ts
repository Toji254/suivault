import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { vaultClient, SUIVAULT_CONFIG } from "../lib/suivault";
import { suiToMist, mistToSui } from "../../sdk/client";
import { AiRiskGuardian } from "../../sdk/guardian";
import { SUIVAULT_DEEPBOOK_TESTNET } from "../../sdk/deepbook";

// --- CONFIGURATION ---
const NETWORK = SUIVAULT_CONFIG.network;
const SUI_RPC_URL = getFullnodeUrl(NETWORK);
const client = new SuiClient({ url: SUI_RPC_URL });

// Strategies copied/adapted from AgentView
const STRATEGIES = [
  { slug: "arbitrage", title: "Arbitrage Swarm", amount: 0.02 },
  { slug: "meme", title: "Meme Accumulator", amount: 0.04 },
  { slug: "sentiment", title: "Sentiment Tracker", amount: 0.01 },
  { slug: "liquidation", title: "Liquidation Bot", amount: 0.03 },
];

const FALLBACK_RECIPIENT = "0xdeeb000000000000000000000000000000000000000000000000000000000000";

async function main() {
  console.log("=== SuiVault Active Agent Starting ===");
  console.log(`Network: ${NETWORK}`);
  console.log(`RPC: ${SUI_RPC_URL}`);

  // 1. Load or Generate Agent Keypair
  let secretKey = process.env.AGENT_SECRET_KEY;
  let keypair: Ed25519Keypair;

  if (secretKey) {
    console.log("Loading agent from AGENT_SECRET_KEY...");
    keypair = Ed25519Keypair.fromSecretKey(secretKey);
  } else {
    console.log("No AGENT_SECRET_KEY found. Generating a new one for this session...");
    keypair = new Ed25519Keypair();
    console.log("\n!!! SAVE THIS KEY IF YOU WANT TO PERSIST THIS AGENT !!!");
    console.log(`AGENT_SECRET_KEY=${keypair.getSecretKey()}`);
    console.log("!!! ---------------------------------------------- !!!\n");
  }

  const agentAddress = keypair.toSuiAddress();
  console.log(`Agent Address: ${agentAddress}`);

  // 2. Check Gas Balance
  const balance = await client.getBalance({ owner: agentAddress });
  const suiBalance = Number(balance.totalBalance) / 1_000_000_000;
  console.log(`Agent Gas Balance: ${suiBalance.toFixed(4)} SUI`);

  if (suiBalance < 0.05) {
    console.warn("\n[WARNING] Low gas balance. Agent might fail to execute transactions.");
    if (NETWORK === "testnet") {
      console.log("You can fund this agent using the Sui Testnet Faucet.");
    }
  }

  // 3. Find Active Vault Keys
  console.log("\nSearching for VaultKeys issued to this agent...");
  const agentKeys = await vaultClient.getAgentKeys(agentAddress);

  if (agentKeys.length === 0) {
    console.error("\n[ERROR] No VaultKeys found for this agent.");
    console.log("To use this agent, go to the SuiVault Dashboard and issue a VaultKey to this address:");
    console.log(`Address: ${agentAddress}`);
    process.exit(1);
  }

  console.log(`Found ${agentKeys.length} active VaultKey(s):`);
  for (const k of agentKeys) {
    console.log(` - Key ID: ${k.id} (Vault: ${k.vaultId})`);
  }

  // 4. Start Trading Loop
  console.log("\nStarting active trading loop... (Press Ctrl+C to stop)");
  
  while (true) {
    try {
      // Pick a random key and strategy
      const k = agentKeys[Math.floor(Math.random() * agentKeys.length)];
      const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
      
      console.log(`\n[${new Date().toLocaleTimeString()}] Intent: ${strategy.title} using Key ${k.id.substring(0, 10)}...`);

      // Resolve Vault
      const vault = await vaultClient.getVault(k.vaultId);
      if (!vault) {
        console.error(`Could not resolve vault ${k.vaultId}`);
        await sleep(10000);
        continue;
      }

      if (vault.isFrozen) {
        console.warn(`Vault ${vault.name} is FROZEN. Skipping...`);
        await sleep(10000);
        continue;
      }

      const amountMist = BigInt(suiToMist(strategy.amount));
      const recipient = vault.policy.allowedRecipients?.[0] || FALLBACK_RECIPIENT;
      
      console.log(` - Vault: ${vault.name} (Balance: ${mistToSui(vault.balance)} SUI)`);
      console.log(` - Amount: ${strategy.amount} SUI`);
      console.log(` - Target: ${recipient}`);

      // Guardian Evaluation
      const guardian = new AiRiskGuardian();
      const isDeepBook = !!vault.policy.isDeepbookOnly;
      const verdict = await guardian.evaluateSpend(
        vault as any,
        k as any,
        amountMist,
        recipient,
        isDeepBook
      );

      if (!verdict.allowed) {
        console.warn(`[BLOCKED BY GUARDIAN] Reason: ${verdict.reason}`);
        console.log("Logging blocked spend on-chain...");
        const logTx = vaultClient.buildLogBlockedSpend(
          vault.id,
          k.id,
          amountMist,
          recipient,
          verdict.reason || "AI Guardian Block",
          verdict.walrusBlobId
        );
        const logRes = await keypair.signAndExecuteTransaction({
          transaction: logTx as any,
          client: client as any,
        });
        console.log(` - Log Tx Digest: ${logRes.digest}`);
      } else {
        console.log(`[ALLOWED BY GUARDIAN] Walrus Log: ${verdict.walrusBlobId}`);
        
        // Build Spend
        const tx = isDeepBook 
          ? vaultClient.buildGuardedDeepBookSwap({
              vaultId: vault.id,
              keyId: k.id,
              amount: amountMist,
              poolKey: "SUI_DBUSDC",
              limitPrice: 1_000_000_000n, // Example limit
              minOut: 0n,
              agentAddress: agentAddress,
              recipient: agentAddress,
              walrusBlobId: verdict.walrusBlobId,
            })
          : vaultClient.buildSpend(
              vault.id,
              k.id,
              amountMist,
              recipient,
              verdict.walrusBlobId
            );

        console.log("Executing spend transaction...");
        const res = await keypair.signAndExecuteTransaction({
          transaction: tx as any,
          client: client as any,
        });

        console.log(`[SUCCESS] Transaction Digest: ${res.digest}`);
        await client.waitForTransaction({ digest: res.digest });
      }

    } catch (err: any) {
      console.error(`\n[ERROR] Loop execution failed: ${err.message}`);
    }

    // Random sleep between 15-45 seconds
    const waitSeconds = Math.floor(Math.random() * 30) + 15;
    console.log(`Waiting ${waitSeconds}s for next trade...`);
    await sleep(waitSeconds * 1000);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error("Fatal Error:", err);
  process.exit(1);
});
