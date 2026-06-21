/**
 * SuiVault Autonomous Agent Daemon
 * --------------------------------------------------------------------------
 * Continuously scans DeepBook testnet for opportunities. When a high-score
 * opportunity is detected:
 *
 *   1. Publishes full decision reasoning (market state + agent evaluation
 *      + execution plan + audit trail) to Walrus testnet for an immutable,
 *      on-chain auditable history.
 *   2. Builds a guarded SuiVault → DeepBook PTB (via the SDK's
 *      `buildGuardedDeepBookSwap`).
 *   3. Persists every step to a local JSON event log so the dashboard
 *      (`/api/active-agent`) can replay activity in real time.
 *
 * Modes:
 *
 *   --dry-run (default in absence of a signer)  Build PTBs only, no signing.
 *   --sign   (requires SUI_PRIVATE_KEY env)     Sign + execute real testnet TXs.
 *
 * Env vars:
 *   VAULT_ID, KEY_ID, AGENT_ADDRESS              Required.
 *   SCAN_INTERVAL_MS        (default 15000)     Polling interval.
 *   APPROVAL_THRESHOLD      (default 70)        Min opportunity score to act on.
 *   SUI_PRIVATE_KEY                              Enables real execution.
 *   EVENT_LOG_PATH          (default ./.agent-events.json)
 *   STATUS_PATH             (default ./.agent-status.json)
 */

import { writeFile, readFile, mkdir, access } from "node:fs/promises";
import { dirname } from "node:path";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Transaction } from "@mysten/sui/transactions";
import { getJsonRpcFullnodeUrl, SuiJsonRpcClient, type SuiJsonRpcClient } from "../sdk/market-scout.js";
import { MarketScout, type MarketOpportunity } from "../sdk/market-scout.js";
import { WalrusAuditClient } from "../sdk/walrus.js";
import { SuiVaultClient } from "../sdk/client.js";

// =====================================================================
// Config / CLI
// =====================================================================

const VAULT_ID = process.env.VAULT_ID || "0xvault";
const KEY_ID = process.env.KEY_ID || "0xkey";
const AGENT_ADDRESS = process.env.AGENT_ADDRESS || "0xagent";
const SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || "15000", 10);
const APPROVAL_THRESHOLD = parseInt(process.env.APPROVAL_THRESHOLD || "70", 10);
const EVENT_LOG_PATH = process.env.EVENT_LOG_PATH || "./.agent-events.json";
const STATUS_PATH = process.env.STATUS_PATH || "./.agent-status.json";
const SUIVAULT_PACKAGE_ID =
  process.env.SUIVAULT_PACKAGE_ID ||
  "0xb1681ec32499ffc90c30d21bc7ffe8d3b160572cd25440e0ed0288a4f31bd98b";

const args = new Set(process.argv.slice(2));
const DRY_RUN = !process.env.SUI_PRIVATE_KEY || args.has("--dry-run");

// =====================================================================
// State
// =====================================================================

interface AgentEvent {
  id: string;
  timestamp: string;
  type: "opportunity" | "approved" | "blocked" | "executed" | "error" | "info";
  title: string;
  description: string;
  data?: Record<string, unknown>;
}

interface AgentStats {
  opportunitiesFound: number;
  decisionsApproved: number;
  decisionsBlocked: number;
  transactionsExecuted: number;
  transactionsSimulated: number;
  errors: number;
  startedAt: string;
  lastScanAt: string | null;
  isActive: boolean;
  mode: "dry-run" | "live";
  vaultId: string;
  agentAddress: string;
}

let stats: AgentStats = {
  opportunitiesFound: 0,
  decisionsApproved: 0,
  decisionsBlocked: 0,
  transactionsExecuted: 0,
  transactionsSimulated: 0,
  errors: 0,
  startedAt: new Date().toISOString(),
  lastScanAt: null,
  isActive: false,
  mode: DRY_RUN ? "dry-run" : "live",
  vaultId: VAULT_ID,
  agentAddress: AGENT_ADDRESS,
};

let recentEvents: AgentEvent[] = [];

async function loadState() {
  try {
    const [evtRaw, statRaw] = await Promise.all([
      readFile(EVENT_LOG_PATH, "utf8").catch(() => "[]"),
      readFile(STATUS_PATH, "utf8").catch(() => null),
    ]);
    recentEvents = JSON.parse(evtRaw).slice(-50);
    if (statRaw) {
      const saved = JSON.parse(statRaw);
      // Keep runtime metadata fresh; preserve counters.
      stats = { ...saved, isActive: false, startedAt: stats.startedAt };
    }
  } catch (err) {
    console.warn("Could not load prior agent state:", (err as Error).message);
  }
}

async function persistEvents() {
  await ensureDir(EVENT_LOG_PATH);
  await ensureDir(STATUS_PATH);
  await writeFile(EVENT_LOG_PATH, JSON.stringify(recentEvents.slice(-50), null, 2));
  await writeFile(STATUS_PATH, JSON.stringify({ ...stats, isActive: true }, null, 2));
}

async function ensureDir(file: string) {
  try {
    await access(dirname(file) || ".");
  } catch {
    await mkdir(dirname(file) || ".", { recursive: true });
  }
}

async function recordEvent(event: AgentEvent) {
  recentEvents.push(event);
  if (recentEvents.length > 50) recentEvents = recentEvents.slice(-50);
  await persistEvents();
}

// =====================================================================
// Wallet / Signer (live mode only)
// =====================================================================

function buildSigner(): Ed25519Keypair | null {
  const raw = process.env.SUI_PRIVATE_KEY;
  if (!raw) return null;
  try {
    if (raw.startsWith("suiprivkey")) {
      const { scheme, secretKey } = decodeSuiPrivateKey(raw);
      if (scheme === "ED25519") return Ed25519Keypair.fromSecretKey(secretKey);
      throw new Error(`Unsupported key scheme: ${scheme}`);
    }
    // Bech32 / hex fallback: 32-byte hex string.
    return Ed25519Keypair.fromSecretKey(Uint8Array.from(Buffer.from(raw, "hex")));
  } catch (err) {
    console.error("Could not load SUI_PRIVATE_KEY:", (err as Error).message);
    process.exit(1);
  }
}

// =====================================================================
// Decision loop
// =====================================================================

async function scoreAndDecide(opportunity: MarketOpportunity, scout: MarketScout) {
  const score = scout.scoreOpportunity(opportunity);
  const decision = score >= APPROVAL_THRESHOLD ? "APPROVED" : "BLOCKED";

  const reasoning = {
    timestamp: new Date().toISOString(),
    opportunity: {
      type: opportunity.type,
      poolKey: opportunity.poolKey,
      baseAsset: opportunity.baseAsset,
      quoteAsset: opportunity.quoteAsset,
      midPrice: opportunity.midPrice,
      currentPrice: opportunity.currentPrice,
      fairValue: opportunity.fairValue,
      fairValueString: opportunity.fairValueString,
      potentialReturn: opportunity.potentialReturn,
      riskLevel: opportunity.riskLevel,
      reason: opportunity.reason,
    },
    agentEvaluation: {
      opportunityScore: score,
      thresholdRequired: APPROVAL_THRESHOLD,
      decision,
      reasoning:
        decision === "APPROVED"
          ? `Opportunity score (${score}) exceeds threshold (${APPROVAL_THRESHOLD}). ` +
            `Risk level ${opportunity.riskLevel}; expected return ${opportunity.potentialReturn.toFixed(2)}%.`
          : `Opportunity score (${score}) below threshold (${APPROVAL_THRESHOLD}); ` +
            `policy vetoed trade to avoid low-edge / high-risk execution.`,
    },
    executionPlan: {
      vaultId: VAULT_ID,
      keyId: KEY_ID,
      amount: opportunity.recommendedAmount?.toString() || "5000000000",
      poolKey: opportunity.poolKey,
      agentAddress: AGENT_ADDRESS,
      recipient: AGENT_ADDRESS,
    },
    runtime: {
      mode: stats.mode,
      scanIntervalMs: SCAN_INTERVAL_MS,
    },
  };

  return { score, decision, reasoning };
}

async function publishReasoning(reasoning: Record<string, unknown>, walrus: WalrusAuditClient) {
  try {
    const result = await walrus.storeJson(reasoning);
    return {
      blobId: result.blobId,
      source: result.source,
      error: result.error,
    };
  } catch (err) {
    return { blobId: `local-${Date.now()}`, source: "fallback" as const, error: (err as Error).message };
  }
}

function buildSwapTransaction(
  vaultClient: SuiVaultClient,
  opportunity: MarketOpportunity,
  agentAddress: string,
  walrusBlobId: string,
): Transaction {
  return vaultClient.buildGuardedDeepBookSwap({
    vaultId: VAULT_ID,
    keyId: KEY_ID,
    amount: opportunity.recommendedAmount ?? BigInt(5_000_000_000),
    poolKey: opportunity.poolKey as any,
    limitPrice: 0n,
    minOut: 0n,
    agentAddress,
    recipient: agentAddress,
    walrusBlobId,
  });
}

async function executeOrSimulate(
  tx: Transaction,
  client: SuiJsonRpcClient,
  signer: Ed25519Keypair | null,
) {
  tx.setSenderIfNotSet((signer?.toSuiAddress() ?? AGENT_ADDRESS) as string);
  if (!signer || DRY_RUN) {
    // Simulate via dev-inspect so we can show real gas accounting.
    try {
      const inspect = await (client as any).devInspectTransactionBlock?.({
        transactionBlock: tx,
        sender: (signer?.toSuiAddress() ?? AGENT_ADDRESS) as string,
      });
      return { kind: "simulated" as const, inspect };
    } catch (err) {
      return { kind: "simulated" as const, error: (err as Error).message };
    }
  }
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
  });
  return { kind: "executed" as const, digest: (result as any).digest ?? null };
}

async function runScanCycle(scout: MarketScout, vaultClient: SuiVaultClient, walrus: WalrusAuditClient, client: SuiJsonRpcClient, signer: Ed25519Keypair | null) {
  stats.lastScanAt = new Date().toISOString();
  // Persist immediately so the dashboard can see "agent is alive" between
  // quiet scans (no opportunities, no errors → no recordEvent call below).
  await persistEvents();
  let opportunities: MarketOpportunity[] = [];
  try {
    opportunities = await scout.scanMarkets();
  } catch (err) {
    stats.errors++;
    await recordEvent({
      id: `evt-${Date.now()}-scan`,
      timestamp: new Date().toISOString(),
      type: "error",
      title: "Scan failed",
      description: (err as Error).message,
    });
    return;
  }

  if (opportunities.length === 0) return;
  stats.opportunitiesFound += opportunities.length;

  await recordEvent({
    id: `evt-${Date.now()}-opp`,
    timestamp: new Date().toISOString(),
    type: "opportunity",
    title: "Market opportunity detected",
    description: `${opportunities.length} candidate(s) on ${[...new Set(opportunities.map((o) => o.poolKey))].join(", ")}`,
    data: { opportunities: opportunities.map((o) => ({ poolKey: o.poolKey, type: o.type, score: scout.scoreOpportunity(o) })) },
  });

  for (const opportunity of opportunities) {
    const { score, decision, reasoning } = await scoreAndDecide(opportunity, scout);

    if (decision === "BLOCKED") {
      stats.decisionsBlocked++;
      await recordEvent({
        id: `evt-${Date.now()}-block`,
        timestamp: new Date().toISOString(),
        type: "blocked",
        title: `Blocked ${opportunity.type} on ${opportunity.poolKey}`,
        description: `Score ${score}/100 below threshold ${APPROVAL_THRESHOLD} (risk ${opportunity.riskLevel})`,
        data: reasoning,
      });
      continue;
    }

    stats.decisionsApproved++;
    const publish = await publishReasoning(reasoning as unknown as Record<string, unknown>, walrus);

    let executionResult: Awaited<ReturnType<typeof executeOrSimulate>>;
    try {
      const tx = buildSwapTransaction(vaultClient, opportunity, AGENT_ADDRESS, publish.blobId);
      executionResult = await executeOrSimulate(tx, client, signer);
      if (executionResult.kind === "executed") {
        stats.transactionsExecuted++;
      } else {
        stats.transactionsSimulated++;
      }
    } catch (err) {
      stats.errors++;
      await recordEvent({
        id: `evt-${Date.now()}-exec-error`,
        timestamp: new Date().toISOString(),
        type: "error",
        title: "Execution failed",
        description: (err as Error).message,
        data: { opportunity: opportunity.poolKey, walrusBlobId: publish.blobId },
      });
      continue;
    }

    await recordEvent({
      id: `evt-${Date.now()}-${executionResult.kind}`,
      timestamp: new Date().toISOString(),
      type: executionResult.kind === "executed" ? "executed" : "approved",
      title:
        executionResult.kind === "executed"
          ? `Executed swap on ${opportunity.poolKey}`
          : `Approved swap on ${opportunity.poolKey} (${stats.mode})`,
      description:
        executionResult.kind === "executed"
          ? `Score ${score}/100 — Walrus blob ${publish.blobId} — digest ${(executionResult as any).digest ?? "n/a"}`
          : `Score ${score}/100 — Walrus blob ${publish.blobId} (${publish.source})`,
      data: {
        ...reasoning,
        walrus: publish,
        execution: executionResult,
      },
    });
  }
}

// =====================================================================
// Main
// =====================================================================

async function main() {
  console.log("🤖 SuiVault Autonomous Agent");
  console.log(`   Vault : ${VAULT_ID}`);
  console.log(`   Key   : ${KEY_ID}`);
  console.log(`   Agent : ${AGENT_ADDRESS}`);
  console.log(`   Mode  : ${stats.mode}`);
  console.log(`   Scan  : ${SCAN_INTERVAL_MS}ms   Threshold: ${APPROVAL_THRESHOLD}/100`);
  console.log(`   Events→ ${EVENT_LOG_PATH}`);
  console.log("");

  const signer = buildSigner();
  if (signer) console.log(`🔑 Loaded signer for ${signer.toSuiAddress()}`);

  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl("testnet"), network: "testnet" });
  const scout = new MarketScout({ client, address: AGENT_ADDRESS });
  const vaultClient = new SuiVaultClient({
    packageId: SUIVAULT_PACKAGE_ID,
    network: "testnet",
  });
  const walrus = new WalrusAuditClient();

  await loadState();
  stats.isActive = true;
  await persistEvents();

  // Emit a startup "info" event so the dashboard feed doesn't look empty
  // during the slow first scan. Cheap and idempotent on restart.
  await recordEvent({
    id: `evt-${Date.now()}-boot`,
    timestamp: new Date().toISOString(),
    type: "info",
    title: "Agent daemon online",
    description: `Scanning ${scout["poolKeys"]?.length ?? "?"} DeepBook pool(s) every ${SCAN_INTERVAL_MS}ms (mode: ${stats.mode})`,
  });

  const shutdown = async (code = 0) => {
    stats.isActive = false;
    await persistEvents();
    console.log("\n📊 Final stats:");
    console.log(`   Opportunities Found: ${stats.opportunitiesFound}`);
    console.log(`   Decisions Approved : ${stats.decisionsApproved}`);
    console.log(`   Decisions Blocked  : ${stats.decisionsBlocked}`);
    console.log(`   TX Executed        : ${stats.transactionsExecuted}`);
    console.log(`   TX Simulated       : ${stats.transactionsSimulated}`);
    console.log(`   Errors             : ${stats.errors}`);
    console.log("\n🛑 Agent stopped.\n");
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));

  console.log("📊 Entering scan loop...\n");

  // Run an initial scan synchronously to surface config errors early.
  await runScanCycle(scout, vaultClient, walrus, client, signer).catch(async (err) => {
    stats.errors++;
    await recordEvent({
      id: `evt-${Date.now()}-boot`,
      timestamp: new Date().toISOString(),
      type: "error",
      title: "Boot scan failed",
      description: (err as Error).message,
    });
  });

  setInterval(() => {
    runScanCycle(scout, vaultClient, walrus, client, signer).catch(async (err) => {
      stats.errors++;
      await recordEvent({
        id: `evt-${Date.now()}-loop`,
        timestamp: new Date().toISOString(),
        type: "error",
        title: "Scan loop error",
        description: (err as Error).message,
      });
    });
  }, SCAN_INTERVAL_MS);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});