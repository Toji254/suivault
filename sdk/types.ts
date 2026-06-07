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
  /** Agent key reputation score (number of successful transactions) */
  reputationScore: number;
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
  /** Whether the agent is restricted to DeepBook only */
  isDeepbookOnly: boolean;
  /** The DeepBook SUI/USDC Pool address */
  deepbookPool: string;
  /** Max order price limit */
  maxPrice: bigint;
  /** Min order price limit */
  minPrice: bigint;
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
  /** Restrict to DeepBook */
  isDeepbookOnly: boolean;
  /** DeepBook SUI/USDC Pool address */
  deepbookPool: string;
  /** Safe max price limit */
  maxPrice: bigint;
  /** Safe min price limit */
  minPrice: bigint;
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
    isDeepbookOnly: false,
    deepbookPool: "",
    maxPrice: BigInt(0),
    minPrice: BigInt(0),
  }),

  /** Moderate: 10 SUI/tx, 100 SUI/day, all hours */
  moderate: (recipients: string[]): PolicyConfig => ({
    maxPerTx: BigInt(10) * ONE_SUI,
    maxPerDay: BigInt(100) * ONE_SUI,
    allowedRecipients: recipients,
    activeHoursStart: 0,
    activeHoursEnd: 0,
    isDeepbookOnly: false,
    deepbookPool: "",
    maxPrice: BigInt(0),
    minPrice: BigInt(0),
  }),

  /** Aggressive: 100 SUI/tx, 1000 SUI/day, no restrictions */
  aggressive: (): PolicyConfig => ({
    maxPerTx: BigInt(100) * ONE_SUI,
    maxPerDay: BigInt(1000) * ONE_SUI,
    allowedRecipients: [],
    activeHoursStart: 0,
    activeHoursEnd: 0,
    isDeepbookOnly: false,
    deepbookPool: "",
    maxPrice: BigInt(0),
    minPrice: BigInt(0),
  }),

  /** Unlimited: No restrictions at all (use with caution) */
  unlimited: (): PolicyConfig => ({
    maxPerTx: BigInt(0),
    maxPerDay: BigInt(0),
    allowedRecipients: [],
    activeHoursStart: 0,
    activeHoursEnd: 0,
    isDeepbookOnly: false,
    deepbookPool: "",
    maxPrice: BigInt(0),
    minPrice: BigInt(0),
  }),

  /** DeepBook specific trading policy */
  deepbook: (pool: string, maxPrice: bigint, minPrice: bigint): PolicyConfig => ({
    maxPerTx: BigInt(10) * ONE_SUI,
    maxPerDay: BigInt(100) * ONE_SUI,
    allowedRecipients: [],
    activeHoursStart: 0,
    activeHoursEnd: 0,
    isDeepbookOnly: true,
    deepbookPool: pool,
    maxPrice: maxPrice,
    minPrice: minPrice,
  }),
} as const;

export const VAULT_TEMPLATES = [
  {
    id: "aggressive-trader",
    name: "Aggressive Trader",
    description: "High-throughput trading bot with larger limits and full-time execution.",
    policy: PolicyPresets.aggressive(),
  },
  {
    id: "safe-yield-farmer",
    name: "Safe Yield Farmer",
    description: "Conservative vault for yield agents with business-hour activity windows.",
    policy: PolicyPresets.conservative([]),
  },
  {
    id: "payment-agent",
    name: "Payment Agent",
    description: "Moderate spend limits for recurring approved payments and operations.",
    policy: PolicyPresets.moderate([]),
  },
] as const;

// ============================================================
// Analytics & Stats Types
// ============================================================

/** Computed vault utilization and expiry metrics */
export interface VaultStats {
  /** Percentage of daily budget used (0 to 100) */
  utilizationPercent: number;
  /** Milliseconds remaining until the daily budget resets */
  timeUntilResetMs: number;
  /** Milliseconds remaining until the active agent key expires (null if no active key) */
  keyExpiryMs: number | null;
}

// ============================================================
// zkLogin Session Types
// ============================================================

export interface ZkLoginSession {
  email: string;
  provider: "google" | "twitch";
  address: string;
  jwt?: string;
  userSalt?: string;
  ephemeralAddress?: string;
}
