import type { Vault } from "../sdk/types.js";

export const DEFAULT_KEY_DURATION_DAYS = 7;
export const DAY_MS = 86_400_000;

export type OwnerAction =
  | "freeze"
  | "unfreeze"
  | "deactivate-key"
  | "rotate-key"
  | "renew-vaultkey"
  | "withdraw-all"
  | "withdraw"
  | "reset-vault"
  | "set-pool";

export function normalizeOwnerAction(raw: string | undefined): OwnerAction | null {
  const action = raw?.toLowerCase();
  if (!action) return null;
  if (action === "renew" || action === "renew-key" || action === "renew-vaultkey") return "renew-vaultkey";
  if (action === "rotate" || action === "rotate-key") return "rotate-key";
  if (action === "empty" || action === "withdraw-all") return "withdraw-all";
  if (action === "reset" || action === "reset-vault") return "reset-vault";
  if (["freeze", "unfreeze", "deactivate-key", "withdraw", "set-pool"].includes(action)) return action as OwnerAction;
  return null;
}

export function keyDurationMsFromDays(rawDays: string | undefined): number {
  const days = Number(rawDays || String(DEFAULT_KEY_DURATION_DAYS));
  if (!Number.isFinite(days) || days <= 0) throw new Error("durationDays must be a positive number");
  return Math.floor(days * DAY_MS);
}

export function amountForWithdraw(rawAmount: string | undefined, vault: Pick<Vault, "balance">): bigint {
  if (!rawAmount || rawAmount === "all") return vault.balance;
  const amount = BigInt(rawAmount);
  if (amount <= 0n) throw new Error("withdraw amount must be positive MIST");
  if (amount > vault.balance) throw new Error(`withdraw amount ${amount} exceeds vault balance ${vault.balance}`);
  return amount;
}

function shellArg(value: string | bigint | number): string {
  const raw = String(value);
  if (/^[A-Za-z0-9_:.-]+$/.test(raw)) return raw;
  return `'${raw.replace(/'/g, `'"'"'`)}'`;
}

export function buildSuiClientCall(params: {
  packageId: string;
  module: string;
  functionName: string;
  typeArgs?: string[];
  args: Array<string | bigint | number>;
  gasBudget?: number;
}): string {
  const typeArgs = params.typeArgs?.length ? ` \\\n  --type-args ${params.typeArgs.map(shellArg).join(" ")}` : "";
  const args = params.args.map(shellArg).join(" \\\n         ");
  return `sui client call \\\n  --package ${shellArg(params.packageId)} \\\n  --module ${shellArg(params.module)} \\\n  --function ${shellArg(params.functionName)}${typeArgs} \\\n  --args ${args} \\\n  --gas-budget ${params.gasBudget || 50000000}`;
}

export function buildWithdrawCliCommand(packageId: string, vaultId: string, capId: string, amountMist: bigint): string {
  return buildSuiClientCall({
    packageId,
    module: "vault",
    functionName: "withdraw",
    typeArgs: ["0x2::sui::SUI"],
    args: [vaultId, capId, amountMist, "0x6"],
  });
}

export function buildDeactivateKeyCliCommand(packageId: string, vaultId: string, capId: string): string {
  return buildSuiClientCall({
    packageId,
    module: "vault",
    functionName: "deactivate_key",
    typeArgs: ["0x2::sui::SUI"],
    args: [vaultId, capId, "0x6"],
  });
}

export function buildIssueKeyCliCommand(params: {
  packageId: string;
  vaultId: string;
  capId: string;
  agentAddress: string;
  agentName: string;
  durationMs: number;
}): string {
  return buildSuiClientCall({
    packageId: params.packageId,
    module: "vault",
    functionName: "issue_new_key_entry",
    typeArgs: ["0x2::sui::SUI"],
    args: [params.vaultId, params.capId, params.agentAddress, params.agentName, params.durationMs, "0x6"],
  });
}
