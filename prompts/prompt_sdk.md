# Build the Full SuiVault TypeScript SDK

You are building the complete TypeScript SDK for **SuiVault**, an on-chain agent wallet protocol deployed on Sui. The Move smart contracts are already deployed and tested (16/16 tests passing). You need to complete the SDK that lets frontends and agents interact with the contracts.

The package ID will be provided after deployment — use a placeholder `PACKAGE_ID` that the user will replace.

---

## EXISTING FILE: `sdk/types.ts` (COMPLETE — DO NOT MODIFY, use as-is)

```typescript
/**
 * SuiVault SDK — TypeScript Types
 *
 * Type definitions matching the Move smart contract structs.
 * These types are used throughout the SDK and frontend integration.
 */

// ============================================================
// Core Object Types (Mirror Move Structs)
// ============================================================

/** Represents an on-chain Vault object */
export interface Vault {
  /** Sui Object ID of the vault */
  id: string;
  /** Address of the human owner */
  owner: string;
  /** Current balance in MIST (1 SUI = 1_000_000_000 MIST) */
  balance: bigint;
  /** Spending policy configuration */
  policy: Policy;
  /** Object ID of the active VaultKey (null if no key issued) */
  agentKeyId: string | null;
  /** Human-readable vault name */
  name: string;
  /** Lifetime total spending in MIST */
  totalSpent: bigint;
  /** Today's spending in MIST (resets daily) */
  todaySpent: bigint;
  /** Timestamp (ms) of last daily spending reset */
  lastResetMs: number;
  /** Timestamp (ms) when vault was created */
  createdAtMs: number;
  /** Kill switch state — if true, all spending is blocked */
  isFrozen: boolean;
}

/** Represents an on-chain VaultKey object — the agent's "debit card" */
export interface VaultKey {
  /** Sui Object ID of the key */
  id: string;
  /** Object ID of the Vault this key unlocks */
  vaultId: string;
  /** Address of the authorized agent */
  agentAddress: string;
  /** Timestamp (ms) when this key expires */
  expiresAtMs: number;
  /** Human-readable agent name */
  agentName: string;
  /** Timestamp (ms) when this key was issued */
  issuedAtMs: number;
}

/** Represents a VaultOwnerCap — proves vault ownership */
export interface VaultOwnerCap {
  /** Sui Object ID of the capability */
  id: string;
  /** Object ID of the Vault this cap controls */
  vaultId: string;
}

// ============================================================
// Policy Types
// ============================================================

/** Spending policy rules embedded in a Vault */
export interface Policy {
  /** Max spend per transaction in MIST (0 = unlimited) */
  maxPerTx: bigint;
  /** Max spend per day in MIST (0 = unlimited) */
  maxPerDay: bigint;
  /** Whitelisted recipient addresses (empty = allow all) */
  allowedRecipients: string[];
  /** Start of allowed activity hours (0-23 UTC) */
  activeHoursStart: number;
  /** End of allowed activity hours (0-23 UTC) */
  activeHoursEnd: number;
}

/** Configuration for creating a new vault */
export interface CreateVaultParams {
  /** Initial deposit amount in MIST */
  depositAmount: bigint;
  /** Human-readable vault name */
  name: string;
  /** Agent wallet address */
  agentAddress: string;
  /** Human-readable agent name */
  agentName: string;
  /** Key validity duration in milliseconds */
  keyDurationMs: number;
  /** Policy configuration */
  policy: PolicyConfig;
  /** Coin object ID to use for deposit */
  coinObjectId: string;
}

/** Policy configuration for vault creation or update */
export interface PolicyConfig {
  /** Max spend per transaction in MIST (0 = unlimited) */
  maxPerTx: bigint;
  /** Max spend per day in MIST (0 = unlimited) */
  maxPerDay: bigint;
  /** Whitelisted recipient addresses (empty = allow all) */
  allowedRecipients: string[];
  /** Active hours start (0-23 UTC, set both to 0 for no restriction) */
  activeHoursStart: number;
  /** Active hours end (0-23 UTC, set both to 0 for no restriction) */
  activeHoursEnd: number;
}

// ============================================================
// Event Types (Match Move Events)
// ============================================================

export interface VaultCreatedEvent {
  vaultId: string;
  owner: string;
  name: string;
  initialBalance: bigint;
}

export interface KeyIssuedEvent {
  vaultId: string;
  keyId: string;
  agentAddress: string;
  agentName: string;
  expiresAtMs: number;
}

export interface SpendApprovedEvent {
  vaultId: string;
  agentAddress: string;
  amount: bigint;
  recipient: string;
  remainingBalance: bigint;
  dailySpent: bigint;
}

export interface SpendBlockedEvent {
  vaultId: string;
  agentAddress: string;
  amount: bigint;
  reason: string;
}

export interface VaultFrozenEvent {
  vaultId: string;
  frozenBy: string;
}

export interface VaultUnfrozenEvent {
  vaultId: string;
  unfrozenBy: string;
}

export interface FundsDepositedEvent {
  vaultId: string;
  amount: bigint;
  newBalance: bigint;
  depositedBy: string;
}

export interface FundsWithdrawnEvent {
  vaultId: string;
  amount: bigint;
  remainingBalance: bigint;
  withdrawnBy: string;
}

export interface KeyRevokedEvent {
  vaultId: string;
  keyId: string;
  revokedBy: string;
}

// ============================================================
// Audit Types
// ============================================================

export interface AuditEntry {
  id: string;
  vaultId: string;
  agentAddress: string;
  actionType: AuditActionType;
  amount: bigint;
  target: string;
  timestampMs: number;
  success: boolean;
  blockReason: string;
  walrusBlobId: string;
}

export type AuditActionType =
  | "spend_approved"
  | "spend_blocked"
  | "vault_frozen"
  | "vault_unfrozen"
  | "key_issued"
  | "key_revoked";

// ============================================================
// SDK Configuration
// ============================================================

export interface SuiVaultConfig {
  /** Deployed package ID on Sui (set after deployment) */
  packageId: string;
  /** Sui network: testnet, mainnet, devnet, or localnet */
  network: "testnet" | "mainnet" | "devnet" | "localnet";
  /** Optional: custom RPC URL */
  rpcUrl?: string;
}

// ============================================================
// Constants
// ============================================================

/** 1 SUI in MIST */
export const ONE_SUI = BigInt(1_000_000_000);
/** Milliseconds in one day */
export const MS_PER_DAY = 86_400_000;
/** Milliseconds in one hour */
export const MS_PER_HOUR = 3_600_000;

/** Error codes matching Move contract */
export enum VaultErrorCode {
  ENotOwner = 0,
  EVaultFrozen = 1,
  EKeyVaultMismatch = 2,
  EKeyExpired = 3,
  EInsufficientBalance = 4,
  EKeyAlreadyIssued = 5,
  ENoActiveKey = 6,
  ENotAgent = 7,
}

export enum PolicyErrorCode {
  EExceedsPerTxLimit = 100,
  EExceedsDailyLimit = 101,
  ERecipientNotWhitelisted = 102,
  EOutsideActiveHours = 103,
  EInvalidActiveHours = 104,
}

// ============================================================
// Policy Preset Templates
// ============================================================

/** Pre-built policy configurations for common agent use cases */
export const PolicyPresets = {
  /** Conservative: 1 SUI/tx, 10 SUI/day, business hours only */
  conservative: (recipients: string[]): PolicyConfig => ({
    maxPerTx: ONE_SUI,
    maxPerDay: BigInt(10) * ONE_SUI,
    allowedRecipients: recipients,
    activeHoursStart: 9,
    activeHoursEnd: 17,
  }),

  /** Moderate: 10 SUI/tx, 100 SUI/day, all hours */
  moderate: (recipients: string[]): PolicyConfig => ({
    maxPerTx: BigInt(10) * ONE_SUI,
    maxPerDay: BigInt(100) * ONE_SUI,
    allowedRecipients: recipients,
    activeHoursStart: 0,
    activeHoursEnd: 0,
  }),

  /** Aggressive: 100 SUI/tx, 1000 SUI/day, no restrictions */
  aggressive: (): PolicyConfig => ({
    maxPerTx: BigInt(100) * ONE_SUI,
    maxPerDay: BigInt(1000) * ONE_SUI,
    allowedRecipients: [],
    activeHoursStart: 0,
    activeHoursEnd: 0,
  }),

  /** Unlimited: No restrictions at all (use with caution) */
  unlimited: (): PolicyConfig => ({
    maxPerTx: BigInt(0),
    maxPerDay: BigInt(0),
    allowedRecipients: [],
    activeHoursStart: 0,
    activeHoursEnd: 0,
  }),
} as const;
```

---

## EXISTING FILE: `sdk/client.ts` (SKELETON — NEEDS COMPLETION)

```typescript
/**
 * SuiVault SDK — Client
 *
 * Transaction builder skeleton for interacting with SuiVault Move contracts.
 * Uses the @mysten/sui SDK for Sui blockchain interactions.
 */

import { Transaction } from "@mysten/sui/transactions";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import type {
  SuiVaultConfig,
  CreateVaultParams,
  PolicyConfig,
  Vault,
  VaultKey,
  AuditEntry,
} from "./types";

export class SuiVaultClient {
  private client: SuiClient;
  private packageId: string;

  constructor(config: SuiVaultConfig) {
    this.packageId = config.packageId;
    this.client = new SuiClient({
      url: config.rpcUrl || getFullnodeUrl(config.network),
    });
  }

  // --- Transaction builders are COMPLETE (buildCreateVault, buildSpend, buildFreezeVault, etc.) ---
  // --- See full file in the project ---

  // ============================================================
  // THE FOLLOWING FUNCTIONS NEED COMPLETION:
  // ============================================================

  async getVault(vaultId: string): Promise<Vault | null> {
    // TODO: Fetch object and parse Move struct fields into Vault type
    return null;
  }

  async getVaultKey(keyId: string): Promise<VaultKey | null> {
    // TODO: Fetch object and parse Move struct fields into VaultKey type
    return null;
  }

  async getVaultsByOwner(ownerAddress: string): Promise<Vault[]> {
    // TODO: Query VaultOwnerCap objects, then fetch corresponding vaults
    return [];
  }

  async getSpendingHistory(vaultId: string, limit?: number): Promise<AuditEntry[]> {
    // TODO: Query events by vault ID
    return [];
  }

  async subscribeToVaultEvents(vaultId: string, callback: (event: unknown) => void): Promise<() => void> {
    // TODO: Use SuiClient.subscribeEvent
    return () => {};
  }
}

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
    100: "Amount exceeds per-transaction limit",
    101: "Amount would exceed daily spending limit",
    102: "Recipient is not whitelisted",
    103: "Current time is outside active hours",
    104: "Invalid active hours configuration",
  };
  return errors[errorCode] || `Unknown error code: ${errorCode}`;
}

export function mistToSui(mist: bigint): string {
  const sui = Number(mist) / 1_000_000_000;
  return sui.toFixed(4);
}

export function suiToMist(sui: number): bigint {
  return BigInt(Math.floor(sui * 1_000_000_000));
}
```

---

## MOVE CONTRACT CONTEXT (for understanding raw object structure)

The Move struct `Vault<T>` has these fields:
- `id: UID`
- `owner: address`
- `balance: Balance<T>`
- `policy: Policy` (nested struct with: `max_per_tx: u64`, `max_per_day: u64`, `allowed_recipients: vector<address>`, `active_hours_start: u8`, `active_hours_end: u8`)
- `agent_key_id: Option<ID>`
- `name: String`
- `total_spent: u64`
- `today_spent: u64`
- `last_reset_ms: u64`
- `created_at_ms: u64`
- `is_frozen: bool`

Raw Sui object response from `getObject` looks like:
```json
{
  "data": {
    "content": {
      "dataType": "moveObject",
      "type": "PACKAGE_ID::vault::Vault<0x2::sui::SUI>",
      "fields": {
        "id": { "id": "0x..." },
        "owner": "0x...",
        "balance": "1000000000",
        "policy": {
          "fields": {
            "max_per_tx": "10000000000",
            "max_per_day": "100000000000",
            "allowed_recipients": ["0x..."],
            "active_hours_start": 9,
            "active_hours_end": 17
          }
        },
        "agent_key_id": { "vec": ["0x..."] },
        "name": "My Vault",
        "total_spent": "0",
        "today_spent": "0",
        "last_reset_ms": "1717000000000",
        "created_at_ms": "1717000000000",
        "is_frozen": false
      }
    }
  }
}
```

The event types emitted by the contract are:
- `PACKAGE_ID::vault::VaultCreated`
- `PACKAGE_ID::vault::KeyIssued`
- `PACKAGE_ID::vault::SpendApproved`
- `PACKAGE_ID::vault::SpendBlocked`
- `PACKAGE_ID::vault::VaultFrozen`
- `PACKAGE_ID::vault::VaultUnfrozen`
- `PACKAGE_ID::vault::FundsDeposited`
- `PACKAGE_ID::vault::FundsWithdrawn`
- `PACKAGE_ID::vault::KeyRevoked`

---

## YOUR TASK

Complete the SDK by implementing these items. Write all files to the `sdk/` directory.

### 1. `sdk/parser.ts` — Object parsing utilities

Write functions to parse raw Sui object responses into typed interfaces:
- `parseVault(rawContent: any): Vault`
- `parseVaultKey(rawContent: any): VaultKey`
- `parseVaultOwnerCap(rawContent: any): VaultOwnerCap`
- `parseAuditEntry(rawContent: any): AuditEntry`
- Handle the `Option<ID>` → `string | null` conversion (`{ vec: ["0x..."] }` → `"0x..."`, `{ vec: [] }` → `null`)
- Handle `u64` string → `bigint` conversion

### 2. Complete `sdk/client.ts` — Implement all TODO stubs

- `getVault()` — fetch object, parse with `parseVault()`
- `getVaultKey()` — fetch object, parse with `parseVaultKey()`
- `getVaultsByOwner()` — query `VaultOwnerCap` objects owned by address using `client.getOwnedObjects({ owner, filter: { StructType: "${packageId}::vault::VaultOwnerCap" }})`, extract `vault_id`, fetch each vault
- `getSpendingHistory()` — query events using `client.queryEvents({ query: { MoveEventType: "${packageId}::vault::SpendApproved" }})`, filter by vault_id, also query `SpendBlocked` events
- `subscribeToVaultEvents()` — use `client.subscribeEvent({ filter: { Package: packageId }})`, filter by vault_id in callback, return unsubscribe function

### 3. Add new functions to `sdk/client.ts`

- `getAgentKeys(agentAddress: string): Promise<VaultKey[]>` — query VaultKey objects owned by address
- `checkSpendWouldSucceed(vaultId: string, amount: bigint, recipient: string): Promise<{ ok: boolean; reason?: string }>` — pre-flight check: fetch vault, check frozen, balance, per-tx, daily limit, recipient whitelist, active hours client-side
- `getVaultStats(vaultId: string): Promise<VaultStats>` — return computed stats: budget utilization %, daily spending progress, key expiry countdown

### 4. `sdk/index.ts` — Barrel export

Export everything from types.ts, client.ts, and parser.ts.

### 5. `sdk/package.json`

```json
{
  "name": "@suivault/sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "@mysten/sui": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "vitest": "^1.0.0"
  }
}
```

### 6. Error handling

When transactions fail, Sui returns errors like: `"MoveAbort(MoveLocation { module: ..., function: ... }, 101)"`. Parse the abort code number and map it using `parseVaultError()`.

## CODE STYLE

- Use async/await, never raw promises
- All public methods must have JSDoc comments
- Strict TypeScript — no `any` except when parsing raw Sui responses
- Use the existing types from `types.ts` — do not redefine them

## DELIVERABLES

Output the complete contents of these files:
1. `sdk/parser.ts` (NEW)
2. `sdk/client.ts` (UPDATED — keep existing transaction builders, implement TODO stubs, add new functions)
3. `sdk/index.ts` (NEW)
4. `sdk/package.json` (NEW)
5. `sdk/tsconfig.json` (NEW)
