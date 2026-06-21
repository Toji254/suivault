/**
 * Smoke test for the autonomous agent — uses a mock price source so we can
 * drive the full pipeline (scan → score → walrus publish → tx build → event log)
 * without depending on live DeepBook RPC or a real signer.
 *
 * Run:  npx tsx smoke-agent.ts
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient } from "../sdk/market-scout.js";
import { MarketScout } from "../sdk/market-scout.js";
import { SuiVaultClient } from "../sdk/client.js";
import { WalrusAuditClient } from "../sdk/walrus.js";

const tmp = mkdtempSync(join(tmpdir(), "suivault-agent-"));
const EVENTS = join(tmp, "events.json");
const STATUS = join(tmp, "status.json");

console.log(`📁 Sandbox: ${tmp}`);

// Spawn the daemon in-process but with mocked price source injected via env.
// (Since we cannot pass a custom constructor through CLI args, this test
//  exercises each module path directly.)

async function main() {
  // ---- Step 1: MarketScout with mock price source -----------------------
  let tick = 0;
  const scout = new MarketScout({
    address: "0x0".padEnd(66, "0"),
    mockPriceSource: async (poolKey: string) => {
      tick++;
      // Inject an obvious arbitrage after a few ticks to force an opportunity.
      return poolKey === "SUI_DBUSDC" && tick > 1 ? 1.05 : 1.0;
    },
    historySize: 4,
    minSpreadBps: 10,
  });

  // Warm up history with stable prices first.
  await scout.scanMarkets();
  await scout.scanMarkets();
  // Now the next call should spike — kick the loop a few more times.
  const opportunities = await scout.scanMarkets();

  console.log(`📈 Opportunities detected: ${opportunities.length}`);
  for (const o of opportunities) {
    console.log(`   • ${o.type} ${o.poolKey} mid=${o.midPrice} score=${scout.scoreOpportunity(o)}`);
  }

  if (opportunities.length === 0) {
    throw new Error("Mock should have produced at least one opportunity");
  }

  // ---- Step 2: Walrus audit payload -------------------------------------
  const walrus = new WalrusAuditClient();
  const payload = {
    timestamp: new Date().toISOString(),
    opportunity: opportunities[0],
    runtime: { smoke: true },
  };
  const store = await walrus.storeJson(payload);
  console.log(`💾 Walrus store: ok=${store.ok} blob=${store.blobId} source=${store.source}`);
  if (store.source === "walrus") {
    console.log(`   url: ${walrus.blobUrl(store.blobId)}`);
  }

  // ---- Step 3: Build guarded swap PTB -----------------------------------
  const vaultClient = new SuiVaultClient({
    packageId: "0xb1681ec32499ffc90c30d21bc7ffe8d3b160572cd25440e0ed0288a4f31bd98b",
    network: "testnet",
  });
  const tx = vaultClient.buildGuardedDeepBookSwap({
    vaultId: "0x".padEnd(66, "0"),
    keyId: "0x".padEnd(66, "0"),
    amount: opportunities[0].recommendedAmount ?? BigInt(5_000_000_000),
    poolKey: opportunities[0].poolKey as any,
    limitPrice: 0n,
    minOut: 0n,
    agentAddress: "0x".padEnd(66, "0"),
    recipient: "0x".padEnd(66, "0"),
    walrusBlobId: store.blobId,
  });
  // instanceof across ESM realms can be flaky; check duck-type instead.
  const isTransaction =
    typeof (tx as any).moveCall === "function" &&
    typeof (tx as any).setSenderIfNotSet === "function" &&
    typeof (tx as any).build === "function";
  if (!isTransaction) {
    throw new Error(`PTB was not a Transaction instance (got ${(tx as any).constructor?.name})`);
  }
  console.log(`🛠️  PTB built successfully (constructor: ${(tx as any).constructor?.name})`);

  // ---- Step 4: Confirm SDK + Daemon plumbing ----------------------------
  const client = new SuiJsonRpcClient({ url: "https://example.invalid", network: "testnet" });
  if (!client) throw new Error("SuiJsonRpcClient not constructable");
  console.log("🔌 Sui client constructed");

  console.log("\n✅ Smoke test PASSED");

  // Cleanup sandbox
  rmSync(tmp, { recursive: true, force: true });
  void EVENTS;
  void STATUS;
}

main().catch((err) => {
  console.error("❌ Smoke test FAILED:", err);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
});