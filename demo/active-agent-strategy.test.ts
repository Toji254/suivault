import assert from "node:assert/strict";
import test from "node:test";
import {
  selectExecutablePool,
  classifyVaultKey,
  createTradeRecord,
  SUPPORTED_VOLATILE_POOLS,
} from "./active-agent-strategy.js";

const now = 1_781_400_000_000;
const suiDbusdc = "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5";
const walSui = "0x8c1c1b186c4fddab1ebd53e0895a36c1d1b3b9a77cd34e607bef49a38af0150a";

test("selectExecutablePool only chooses the pool allowed by the active vault policy", () => {
  const decision = selectExecutablePool({
    policyPoolAddress: walSui,
    preferredPoolKeys: ["SUI_DBUSDC", "WAL_SUI", "DEEP_SUI"],
    holdingCoin: "SUI",
  });

  assert.equal(decision?.poolKey, "WAL_SUI");
  assert.equal(decision?.volatile, true);
  assert.equal(decision?.direction, "quoteToBase");
  assert.equal(decision?.fromCoin, "SUI");
  assert.equal(decision?.toCoin, "WAL");
});

test("selectExecutablePool rejects unsupported policy pools instead of silently falling back to SUI/DBUSDC", () => {
  const decision = selectExecutablePool({
    policyPoolAddress: "0x999",
    preferredPoolKeys: ["SUI_DBUSDC", "WAL_SUI"],
    holdingCoin: "SUI",
  });

  assert.equal(decision, null);
});

test("supported volatile pools include non SUI/DBUSDC routes that can be funded from a SUI vault", () => {
  const keys = SUPPORTED_VOLATILE_POOLS.map((pool) => pool.poolKey);
  assert.ok(keys.includes("WAL_SUI"));
  assert.ok(keys.includes("DEEP_SUI"));
  assert.ok(!SUPPORTED_VOLATILE_POOLS.some((pool) => pool.poolKey === "SUI_DBUSDC" && pool.volatile));
});

test("classifyVaultKey tells the runner to stop before an expired key hits chain", () => {
  assert.deepEqual(classifyVaultKey({ expiresAtMs: now - 1 }, now), {
    usable: false,
    reason: "expired",
  });
  assert.deepEqual(classifyVaultKey({ expiresAtMs: now + 30_000 }, now, 60_000), {
    usable: false,
    reason: "expires_soon",
  });
  assert.deepEqual(classifyVaultKey({ expiresAtMs: now + 120_000 }, now, 60_000), {
    usable: true,
    reason: "active",
  });
});

test("createTradeRecord marks PnL pending unless a real accounting source is supplied", () => {
  const record = createTradeRecord({
    strategy: "volatile-momentum",
    poolKey: "WAL_SUI",
    digest: "abc",
    amountMist: 1_000_000n,
    quote: { expectedOut: 12.34, price: 0.081, source: "deepbook-simulated-quote" },
    timestamp: "2026-06-14T00:00:00.000Z",
  });

  assert.equal(record.kind, "real_trade_executed");
  assert.equal(record.market, "DeepBook WAL/SUI");
  assert.equal(record.realizedPnlSui, null);
  assert.equal(record.pnlStatus, "pending_close_or_fill_indexing");
});
