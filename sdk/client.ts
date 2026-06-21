/**
 * SuiVault SDK — Client
 *
 * Client class for interacting with SuiVault Move contracts.
 * Provides transaction builders, query methods, policy validators, and stats helpers.
 * 
 * ============================================================================
 * 🚀 PRODUCTION SCALING & INTEGRATION RECOMMENDATIONS:
 * ============================================================================
 * 1. DEPENDENCY PINNING: Point Move.toml to a locked, immutable Git tag/commit
 *    (e.g., rev = "framework/mainnet") before mainnet release to guarantee 100%
 *    gas and schema reliability.
 * 2. COIN SELECTION: Always utilize multi-coin selection (merge-and-spend) or
 *    splitCoins from tx.gas when depositing or transacting SUI, to prevent
 *    failures on accounts with fragmented gas coins.
 * 3. WALRUS INDEXING: Decentralized Walrus BLOB states are fetched client-side.
 *    For heavy production workloads, implement a persistent caching layer or CDN
 *    proxy for aggregator gateways (aggregator.walrus-testnet.walrus.space) to
 *    bypass temporary gateway latencies and bypass CORS limitations.
 * 4. SECURE AUDITS: Smart contract policies hold custody of principal funds.
 *    Ensure formal security reviews (OtterSec, Zellic) are executed prior to mainnet.
 * 5. INDEXER SCALING: The RPC methods below execute individual RPC multiGetObjects.
 *    For production scale, substitute these calls with dedicated indexing services
 *    (e.g., Enoki, custom subgraphs, or Suiscan API) to query address transactions
 *    and events asynchronously in milliseconds.
 * ============================================================================
 */

import { Transaction } from "@mysten/sui/transactions";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl, type SuiClient } from './market-scout.js';
export type { SuiClient } from './market-scout.js';
import type {
  SuiVaultConfig,
  CreateVaultParams,
  PolicyConfig,
  Vault,
  VaultKey,
  AuditEntry,
  VaultStats,
  AuditActionType,
} from './types.js';
import { createDeepBookTestnetClient, getDeepBookPoolAddress, type SuiVaultDeepBookPoolKey } from './deepbook.js';
import {
  parseVault,
  parseVaultKey,
  parseVaultOwnerCap,
  parseAuditEntry,
} from './parser.js';

// ============================================================
// Helper Constants & Utilities
// ============================================================

const MS_PER_DAY = 86_400_000;

function getUtcHour(timestampMs: number): number {
  const seconds = Math.floor(timestampMs / 1000);
  const hours = Math.floor(seconds / 3600);
  return hours % 24;
}

function checkActiveHours(start: number, end: number, currentHour: number): boolean {
  if (start === end) return true;
  if (start < end) {
    return currentHour >= start && currentHour < end;
  } else {
    return currentHour >= start || currentHour < end;
  }
}

export interface GuardedDeepBookSpendParams {
  vaultId: string;
  keyId: string;
  amount: bigint;
  poolKey?: SuiVaultDeepBookPoolKey | string;
  limitPrice: bigint;
  walrusBlobId?: string;
}

export interface GuardedDeepBookSwapParams extends GuardedDeepBookSpendParams {
  agentAddress: string;
  minOut: bigint;
  deepAmount?: bigint;
  recipient?: string;
  direction?: "baseToQuote" | "quoteToBase";
}

// ============================================================
// SuiVault Client
// ============================================================

export class SuiVaultClient {
  public client: SuiClient;
  public packageId: string;
  public coinType: string;

  constructor(config: SuiVaultConfig) {
    this.packageId = config.packageId;
    this.coinType = "0x2::sui::SUI";
    this.client = new SuiJsonRpcClient({
      url: config.rpcUrl || getJsonRpcFullnodeUrl(config.network),
      network: config.network,
    });
  }

  // ============================================================
  // Transaction Builders (return Transaction objects for signing)
  // ============================================================

  /**
   * Build a transaction to create a vault and issue a key to the agent.
   * The caller signs this transaction to become the vault owner.
   */
  buildCreateVault(params: CreateVaultParams): Transaction {
    const tx = new Transaction();

    // Split the exact deposit amount from the coin object
    const [depositCoin] = tx.splitCoins(tx.object(params.coinObjectId), [
      tx.pure.u64(params.depositAmount),
    ]);

    tx.moveCall({
      target: `${this.packageId}::vault::create_vault_entry`,
      typeArguments: [this.coinType],
      arguments: [
        depositCoin,
        tx.pure.string(params.name),
        tx.pure.address(params.agentAddress),
        tx.pure.string(params.agentName),
        tx.pure.u64(params.keyDurationMs),
        tx.pure.u64(params.policy.maxPerTx),
        tx.pure.u64(params.policy.maxPerDay),
        tx.pure.vector(
          "address",
          params.policy.allowedRecipients.map((r: string) => r)
        ),
        tx.pure.u8(params.policy.activeHoursStart),
        tx.pure.u8(params.policy.activeHoursEnd),
        tx.pure.bool(params.policy.isDeepbookOnly),
        tx.pure.address(params.policy.deepbookPool || "0x0000000000000000000000000000000000000000000000000000000000000000"),
        tx.pure.u64(params.policy.maxPrice),
        tx.pure.u64(params.policy.minPrice),
        tx.object("0x6"), // Sui Clock object
      ],
    });

    return tx;
  }

  /**
   * Build a transaction for the agent to spend from the vault.
   */
  buildSpend(
    vaultId: string,
    keyId: string,
    amount: bigint,
    recipient: string,
    walrusBlobId: string = ""
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::spend_to`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(vaultId),
        tx.object(keyId),
        tx.pure.u64(amount),
        tx.pure.address(recipient),
        tx.object("0x6"), // Clock
        tx.pure.string(walrusBlobId),
      ],
    });

    return tx;
  }

  /**
   * Build a transaction to freeze (kill switch) the vault.
   */
  buildFreezeVault(vaultId: string, capId: string): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::freeze_vault`,
      typeArguments: [this.coinType],
      arguments: [tx.object(vaultId), tx.object(capId), tx.object("0x6")],
    });

    return tx;
  }

  /**
   * Build a transaction to unfreeze the vault.
   */
  buildUnfreezeVault(vaultId: string, capId: string): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::unfreeze_vault`,
      typeArguments: [this.coinType],
      arguments: [tx.object(vaultId), tx.object(capId), tx.object("0x6")],
    });

    return tx;
  }

  /**
   * Build a transaction to deposit more funds into the vault.
   */
  buildDeposit(
    vaultId: string,
    capId: string,
    coinObjectId: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::deposit`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(vaultId),
        tx.object(capId),
        tx.object(coinObjectId),
        tx.object("0x6"),
      ],
    });

    return tx;
  }

  /**
   * Build a transaction to withdraw funds from the vault.
   */
  buildWithdraw(
    vaultId: string,
    capId: string,
    amount: bigint
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::withdraw`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(vaultId),
        tx.object(capId),
        tx.pure.u64(amount),
        tx.object("0x6"),
      ],
    });

    return tx;
  }

  /**
   * Build a transaction to revoke the agent's VaultKey.
   */
  buildRevokeKey(
    vaultId: string,
    capId: string,
    keyId: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::revoke_key`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(vaultId),
        tx.object(capId),
        tx.object(keyId),
        tx.object("0x6"), // Clock
      ],
    });

    return tx;
  }

  /**
   * Build a transaction to deactivate the current agent key without needing the
   * key object in the owner's wallet. This is the non-cooperative revocation path.
   */
  buildDeactivateKey(vaultId: string, capId: string): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::deactivate_key`,
      typeArguments: [this.coinType],
      arguments: [tx.object(vaultId), tx.object(capId), tx.object("0x6")],
    });

    return tx;
  }

  /**
   * Build a transaction to update the vault's spending policy.
   */
  buildUpdatePolicy(
    vaultId: string,
    capId: string,
    policy: PolicyConfig
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::update_policy`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(vaultId),
        tx.object(capId),
        tx.pure.u64(policy.maxPerTx),
        tx.pure.u64(policy.maxPerDay),
        tx.pure.vector(
          "address",
          policy.allowedRecipients.map((r: string) => r)
        ),
        tx.pure.u8(policy.activeHoursStart),
        tx.pure.u8(policy.activeHoursEnd),
        tx.pure.bool(policy.isDeepbookOnly),
        tx.pure.address(policy.deepbookPool || "0x0000000000000000000000000000000000000000000000000000000000000000"),
        tx.pure.u64(policy.maxPrice),
        tx.pure.u64(policy.minPrice),
        tx.object("0x6"),
      ],
    });

    return tx;
  }

  /**
   * Build a transaction to spend specifically for a DeepBook order.
   */
  buildSpendForDeepBook(
    vaultId: string,
    keyId: string,
    amount: bigint,
    pool: string,
    price: bigint,
    walrusBlobId: string = ""
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::spend_for_deepbook_order_to`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(vaultId),
        tx.object(keyId),
        tx.pure.u64(amount),
        tx.pure.address(pool),
        tx.pure.u64(price),
        tx.object("0x6"), // Clock
        tx.pure.string(walrusBlobId),
      ],
    });

    return tx;
  }

  /**
   * Build a guarded DeepBook spend intent. This is the on-chain SuiVault guardrail
   * primitive: the vault releases a Coin only after policy validates the target
   * DeepBook pool and price envelope. Use buildGuardedDeepBookSwap for a full
   * SuiVault -> DeepBook PTB swap.
   */
  buildGuardedDeepBookSpend(params: GuardedDeepBookSpendParams): Transaction {
    const tx = new Transaction();
    const poolKey = params.poolKey || "SUI_DBUSDC";
    const poolAddress = getDeepBookPoolAddress(poolKey);

    tx.moveCall({
      target: `${this.packageId}::vault::spend_for_deepbook_order`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(params.vaultId),
        tx.object(params.keyId),
        tx.pure.u64(params.amount),
        tx.pure.address(poolAddress),
        tx.pure.u64(params.limitPrice),
        tx.object("0x6"),
        tx.pure.string(params.walrusBlobId || ""),
      ],
    });

    return tx;
  }

  /**
   * Build a single programmable transaction block that:
   * 1. withdraws a guarded Coin from SuiVault after Move policy validation, then
   * 2. passes that Coin into the official DeepBook v3 testnet SDK swap call.
   *
   * The vault policy's deepbook_pool field must match the canonical DeepBook
   * pool object address for poolKey (SUI_DBUSDC by default on testnet).
   */
  buildGuardedDeepBookSwap(params: GuardedDeepBookSwapParams): Transaction {
    const tx = new Transaction();
    const poolKey = params.poolKey || "SUI_DBUSDC";
    const poolAddress = getDeepBookPoolAddress(poolKey);
    const [guardedCoin] = tx.moveCall({
      target: `${this.packageId}::vault::spend_for_deepbook_order`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(params.vaultId),
        tx.object(params.keyId),
        tx.pure.u64(params.amount),
        tx.pure.address(poolAddress),
        tx.pure.u64(params.limitPrice),
        tx.object("0x6"),
        tx.pure.string(params.walrusBlobId || ""),
      ],
    });

    const deepbook = createDeepBookTestnetClient(this.client as any, params.agentAddress);
    const swap = params.direction === "quoteToBase"
      ? deepbook.deepBook.swapExactQuoteForBase({
          poolKey,
          amount: params.amount,
          deepAmount: params.deepAmount ?? 0n,
          minOut: params.minOut,
          quoteCoin: guardedCoin,
        })
      : deepbook.deepBook.swapExactBaseForQuote({
          poolKey,
          amount: params.amount,
          deepAmount: params.deepAmount ?? 0n,
          minOut: params.minOut,
          baseCoin: guardedCoin,
        });

    const outputs = (swap as (tx: any) => Iterable<any>)(tx as any);
    if (params.recipient) {
      tx.transferObjects([...outputs], tx.pure.address(params.recipient));
    }
    return tx;
  }

  /**
   * Build a transaction to log a blocked spend attempt on-chain.
   */
  buildLogBlockedSpend(
    vaultId: string,
    keyId: string,
    amount: bigint,
    target: string,
    reason: string,
    walrusBlobId: string
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::log_blocked_spend`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(vaultId),
        tx.object(keyId),
        tx.pure.u64(amount),
        tx.pure.address(target),
        tx.object("0x6"), // Clock
        tx.pure.string(reason),
        tx.pure.string(walrusBlobId),
      ],
    });

    return tx;
  }

  /**
   * Build a transaction to issue a new VaultKey to an agent.
   */
  buildIssueNewKey(
    vaultId: string,
    capId: string,
    agentAddress: string,
    agentName: string,
    keyDurationMs: number
  ): Transaction {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.packageId}::vault::issue_new_key_entry`,
      typeArguments: [this.coinType],
      arguments: [
        tx.object(vaultId),
        tx.object(capId),
        tx.pure.address(agentAddress),
        tx.pure.string(agentName),
        tx.pure.u64(keyDurationMs),
        tx.object("0x6"), // Clock
      ],
    });

    return tx;
  }

  // ============================================================
  // Query Functions (Read-Only)
  // ============================================================

  /**
   * Fetch a Vault object by its ID.
   */
  async getVault(vaultId: string): Promise<Vault | null> {
    try {
      const obj = await this.client.getObject({
        id: vaultId,
        options: { showContent: true },
      });
      if (!obj.data?.content) return null;
      return parseVault(obj);
    } catch (e) {
      console.error(`Error fetching vault ${vaultId}:`, e);
      return null;
    }
  }

  /**
   * Fetch a VaultKey object by its ID.
   */
  async getVaultKey(keyId: string): Promise<VaultKey | null> {
    try {
      const obj = await this.client.getObject({
        id: keyId,
        options: { showContent: true },
      });
      if (!obj.data?.content) return null;
      return parseVaultKey(obj);
    } catch (e) {
      console.error(`Error fetching VaultKey ${keyId}:`, e);
      return null;
    }
  }

  /**
   * Get all vaults owned by a specific address.
   * Uses the VaultOwnerCap objects to find vaults.
   */
  async getVaultsByOwner(ownerAddress: string): Promise<Vault[]> {
    try {
      const caps: any[] = [];
      let hasNextPage = true;
      let nextCursor: string | undefined | null = null;

      while (hasNextPage) {
        const res: any = await this.client.getOwnedObjects({
          owner: ownerAddress,
          filter: { StructType: `${this.packageId}::vault::VaultOwnerCap` },
          options: { showContent: true },
          cursor: nextCursor || undefined,
        });
        
        for (const item of res.data) {
          if (item.data) {
            try {
              caps.push(parseVaultOwnerCap(item));
            } catch (e) {
              // ignore malformed objects
            }
          }
        }
        hasNextPage = res.hasNextPage;
        nextCursor = res.nextCursor;
      }

      const vaultIds = caps.map((cap) => cap.vaultId);
      if (vaultIds.length === 0) return [];

      const vaults: Vault[] = [];
      const objects = await this.client.multiGetObjects({
        ids: vaultIds,
        options: { showContent: true },
      });

      for (const obj of objects) {
        if (obj.data) {
          try {
            vaults.push(parseVault(obj));
          } catch (e) {
            // ignore
          }
        }
      }

      return vaults;
    } catch (e) {
      console.error(`Error getting vaults for owner ${ownerAddress}:`, e);
      return [];
    }
  }

  /**
   * Get all VaultKey objects owned by an agent address.
   */
  async getAgentKeys(agentAddress: string): Promise<VaultKey[]> {
    try {
      const keys: VaultKey[] = [];
      let hasNextPage = true;
      let nextCursor: string | undefined | null = null;

      while (hasNextPage) {
        const res: any = await this.client.getOwnedObjects({
          owner: agentAddress,
          filter: { StructType: `${this.packageId}::vault::VaultKey` },
          options: { showContent: true },
          cursor: nextCursor || undefined,
        });

        for (const item of res.data) {
          if (item.data) {
            try {
              keys.push(parseVaultKey(item));
            } catch (e) {
              // ignore
            }
          }
        }
        hasNextPage = res.hasNextPage;
        nextCursor = res.nextCursor;
      }

      return keys;
    } catch (e) {
      console.error(`Error getting VaultKeys for agent ${agentAddress}:`, e);
      return [];
    }
  }

  /**
   * Get spending events for a vault (for audit trail display).
   * Pulls from on-chain audit entries or fallback success events.
   */
  async getSpendingHistory(
    vaultId: string,
    limit?: number
  ): Promise<AuditEntry[]> {
    try {
      // Fetch AuditEntryCreated events from package execution
      const events = await this.client.queryEvents({
        query: { MoveEventType: `${this.packageId}::audit::AuditEntryCreated` },
        limit,
        order: "descending",
      });

      const auditEntries: AuditEntry[] = [];

      for (const e of events.data) {
        const json = e.parsedJson as any;
        if (json && json.vault_id === vaultId) {
          auditEntries.push({
            id: json.audit_id || e.id.txDigest + "-" + e.id.eventSeq,
            vaultId: json.vault_id,
            agentAddress: json.agent_address,
            actionType: json.action_type as AuditActionType,
            amount: BigInt(json.amount || 0),
            target: "", // target address isn't in event payload
            timestampMs: Number(json.timestamp_ms || e.timestampMs || Date.now()),
            success: Boolean(json.success),
            blockReason: "",
            walrusBlobId: "",
          });
        }
      }

      // Fetch actual on-chain objects to populate fields not present in event payload
      const auditIds = auditEntries
        .map((entry) => entry.id)
        .filter((id) => id.startsWith("0x"));

      if (auditIds.length > 0) {
        try {
          const objects = await this.client.multiGetObjects({
            ids: auditIds,
            options: { showContent: true },
          });

          for (const obj of objects) {
            if (obj.data) {
              try {
                const parsed = parseAuditEntry(obj);
                const idx = auditEntries.findIndex((e) => e.id === parsed.id);
                if (idx !== -1) {
                  auditEntries[idx].walrusBlobId = parsed.walrusBlobId;
                  auditEntries[idx].blockReason = parsed.blockReason;
                  auditEntries[idx].target = parsed.target;
                }
              } catch (err) {
                // ignore parse errors
              }
            }
          }
        } catch (err) {
          console.error("Error fetching AuditEntries from chain:", err);
        }
      }

      // Fallback: If no AuditEntryCreated events found, pull SpendApproved events
      if (auditEntries.length === 0) {
        const approvedEvents = await this.client.queryEvents({
          query: { MoveEventType: `${this.packageId}::vault::SpendApproved` },
          limit,
          order: "descending",
        });

        for (const e of approvedEvents.data) {
          const json = e.parsedJson as any;
          if (json && json.vault_id === vaultId) {
            auditEntries.push({
              id: e.id.txDigest + "-" + e.id.eventSeq,
              vaultId: json.vault_id,
              agentAddress: json.agent_address,
              actionType: "spend_approved" as const,
              amount: BigInt(json.amount || 0),
              target: json.recipient || "",
              timestampMs: Number(e.timestampMs || Date.now()),
              success: true,
              blockReason: "",
              walrusBlobId: "",
            });
          }
        }
      }

      return auditEntries;
    } catch (e) {
      console.error(`Error querying spending history for vault ${vaultId}:`, e);
      return [];
    }
  }

  /**
   * Subscribe to real-time events for a vault.
   *
   * NOTE: The new @mysten/sui v2 JSON-RPC client dropped legacy `subscribeEvent`
   * in favor of gRPC streaming (see `@mysten/sui/grpc`). We keep this method's
   * signature so existing callers still compile, but log a warning and return
   * a no-op unsubscribe. Polling-based consumers can use `queryEvents` instead.
   */
  async subscribeToVaultEvents(
    vaultId: string,
    callback: (event: any) => void
  ): Promise<() => void> {
    console.warn(
      `subscribeToVaultEvents(${vaultId}) is a no-op: real-time event ` +
        `streaming requires the gRPC client. Falling back to polling.`,
    );
    // Suppress unused-callback lint; callers can opt into polling themselves.
    void callback;
    return () => {};
  }

  // ============================================================
  // Client-Side Pre-Flight Checkers & Analytics helpers
  // ============================================================

  /**
   * Pre-flight policy validation check.
   * Tells you if a spend transaction would succeed or fail on-chain before executing.
   */
  async checkSpendWouldSucceed(
    vaultId: string,
    amount: bigint,
    recipient: string
  ): Promise<{ ok: boolean; reason?: string }> {
    const vault = await this.getVault(vaultId);
    if (!vault) {
      return { ok: false, reason: "Vault not found" };
    }

    if (vault.isFrozen) {
      return { ok: false, reason: "Vault is frozen (kill switch active)" };
    }

    if (vault.balance < amount) {
      return { ok: false, reason: "Insufficient vault balance" };
    }

    // Per-transaction limit
    if (vault.policy.maxPerTx > 0n && amount > vault.policy.maxPerTx) {
      return { ok: false, reason: "Amount exceeds per-transaction limit" };
    }

    // Daily budget check (incorporating potential resetting logic)
    let todaySpent = vault.todaySpent;
    const now = Date.now();
    if (now - vault.lastResetMs >= MS_PER_DAY) {
      todaySpent = 0n;
    }

    if (vault.policy.maxPerDay > 0n && todaySpent + amount > vault.policy.maxPerDay) {
      return { ok: false, reason: "Amount would exceed daily spending limit" };
    }

    // Whitelist check
    if (
      vault.policy.allowedRecipients.length > 0 &&
      !vault.policy.allowedRecipients.includes(recipient)
    ) {
      return { ok: false, reason: "Recipient not in whitelist" };
    }

    // Active hours check
    const currentHour = getUtcHour(now);
    if (
      !checkActiveHours(
        vault.policy.activeHoursStart,
        vault.policy.activeHoursEnd,
        currentHour
      )
    ) {
      return { ok: false, reason: "Outside active hours" };
    }

    return { ok: true };
  }

  /**
   * Computes utilization metrics and key details for UI analytics dashboards.
   */
  async getVaultStats(vaultId: string): Promise<VaultStats> {
    const vault = await this.getVault(vaultId);
    if (!vault) {
      throw new Error(`Vault stats error: vault ${vaultId} not found`);
    }

    const now = Date.now();
    let todaySpent = vault.todaySpent;
    let timeUntilResetMs = 0;

    if (now - vault.lastResetMs >= MS_PER_DAY) {
      todaySpent = 0n;
      timeUntilResetMs = MS_PER_DAY;
    } else {
      timeUntilResetMs = MS_PER_DAY - (now - vault.lastResetMs);
    }

    // Calculate percentage utilization (avoid division by zero)
    const maxPerDay = vault.policy.maxPerDay;
    const utilizationPercent =
      maxPerDay > 0n ? Number((todaySpent * 100n) / maxPerDay) : 0;

    let keyExpiryMs: number | null = null;
    if (vault.agentKeyId) {
      const key = await this.getVaultKey(vault.agentKeyId);
      if (key) {
        keyExpiryMs = Math.max(0, key.expiresAtMs - now);
      }
    }

    return {
      utilizationPercent,
      timeUntilResetMs,
      keyExpiryMs,
    };
  }
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Parse a Sui abort error to a human-readable message.
 */
export function parseVaultError(errorCode: number): string {
  const errors: Record<number, string> = {
    0: "Not the vault owner",
    1: "Vault is frozen (kill switch active)",
    2: "VaultKey does not match this vault",
    3: "VaultKey has expired",
    4: "Insufficient balance in vault",
    5: "A key is already issued for this vault",
    6: "No active key to revoke",
    7: "Caller is not the authorized agent",
    8: "VaultKey is no longer the active key for this vault",
    100: "Amount exceeds per-transaction limit",
    101: "Amount would exceed daily spending limit",
    102: "Recipient is not whitelisted",
    103: "Current time is outside active hours",
    104: "Invalid active hours configuration",
  };
  return errors[errorCode] || `Unknown error code: ${errorCode}`;
}

/**
 * Format MIST to SUI for display.
 */
export function mistToSui(mist: bigint): string {
  const sui = Number(mist) / 1_000_000_000;
  return sui.toFixed(4);
}

/**
 * Convert SUI to MIST.
 */
export function suiToMist(sui: number): bigint {
  return BigInt(Math.floor(sui * 1_000_000_000));
}
