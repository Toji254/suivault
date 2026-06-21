import assert from "node:assert/strict";
import test from "node:test";
import {
  amountForWithdraw,
  buildDeactivateKeyCliCommand,
  buildIssueKeyCliCommand,
  buildWithdrawCliCommand,
  keyDurationMsFromDays,
  normalizeOwnerAction,
} from "./owner-action-helpers.js";

test("normalizeOwnerAction accepts simple user-facing renew and reset aliases", () => {
  assert.equal(normalizeOwnerAction("renew"), "renew-vaultkey");
  assert.equal(normalizeOwnerAction("renew-key"), "renew-vaultkey");
  assert.equal(normalizeOwnerAction("empty"), "withdraw-all");
  assert.equal(normalizeOwnerAction("reset"), "reset-vault");
  assert.equal(normalizeOwnerAction("nonsense"), null);
});

test("amountForWithdraw defaults to all vault funds and rejects bad amounts", () => {
  const vault = { balance: 452000000n };
  assert.equal(amountForWithdraw(undefined, vault), 452000000n);
  assert.equal(amountForWithdraw("all", vault), 452000000n);
  assert.equal(amountForWithdraw("1000", vault), 1000n);
  assert.throws(() => amountForWithdraw("0", vault), /positive/);
  assert.throws(() => amountForWithdraw("999999999", vault), /exceeds/);
});

test("keyDurationMsFromDays produces simple positive millisecond durations", () => {
  assert.equal(keyDurationMsFromDays("7"), 604800000);
  assert.throws(() => keyDurationMsFromDays("0"), /positive/);
});

test("CLI fallback commands are copy-pasteable for owner wallet users", () => {
  const withdraw = buildWithdrawCliCommand("0xpack", "0xvault", "0xcap", 452000000n);
  assert.match(withdraw, /--function withdraw/);
  assert.match(withdraw, /--type-args 0x2::sui::SUI/);
  assert.match(withdraw, /0xvault/);
  assert.match(withdraw, /452000000/);

  const deactivate = buildDeactivateKeyCliCommand("0xpack", "0xvault", "0xcap");
  assert.match(deactivate, /--function deactivate_key/);

  const issue = buildIssueKeyCliCommand({
    packageId: "0xpack",
    vaultId: "0xvault",
    capId: "0xcap",
    agentAddress: "0xagent",
    agentName: "SuiVault Active Agent",
    durationMs: 604800000,
  });
  assert.match(issue, /--function issue_new_key_entry/);
  assert.match(issue, /0xagent/);
  assert.match(issue, /604800000/);
});
