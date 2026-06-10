/**
 * SuiVault SDK — TypeScript Types
 *
 * Type definitions matching the Move smart contract structs.
 * These types are used throughout the SDK and frontend integration.
 */
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
export var VaultErrorCode;
(function (VaultErrorCode) {
    VaultErrorCode[VaultErrorCode["ENotOwner"] = 0] = "ENotOwner";
    VaultErrorCode[VaultErrorCode["EVaultFrozen"] = 1] = "EVaultFrozen";
    VaultErrorCode[VaultErrorCode["EKeyVaultMismatch"] = 2] = "EKeyVaultMismatch";
    VaultErrorCode[VaultErrorCode["EKeyExpired"] = 3] = "EKeyExpired";
    VaultErrorCode[VaultErrorCode["EInsufficientBalance"] = 4] = "EInsufficientBalance";
    VaultErrorCode[VaultErrorCode["EKeyAlreadyIssued"] = 5] = "EKeyAlreadyIssued";
    VaultErrorCode[VaultErrorCode["ENoActiveKey"] = 6] = "ENoActiveKey";
    VaultErrorCode[VaultErrorCode["ENotAgent"] = 7] = "ENotAgent";
})(VaultErrorCode || (VaultErrorCode = {}));
export var PolicyErrorCode;
(function (PolicyErrorCode) {
    PolicyErrorCode[PolicyErrorCode["EExceedsPerTxLimit"] = 100] = "EExceedsPerTxLimit";
    PolicyErrorCode[PolicyErrorCode["EExceedsDailyLimit"] = 101] = "EExceedsDailyLimit";
    PolicyErrorCode[PolicyErrorCode["ERecipientNotWhitelisted"] = 102] = "ERecipientNotWhitelisted";
    PolicyErrorCode[PolicyErrorCode["EOutsideActiveHours"] = 103] = "EOutsideActiveHours";
    PolicyErrorCode[PolicyErrorCode["EInvalidActiveHours"] = 104] = "EInvalidActiveHours";
})(PolicyErrorCode || (PolicyErrorCode = {}));
// ============================================================
// Policy Preset Templates
// ============================================================
/** Pre-built policy configurations for common agent use cases */
export const PolicyPresets = {
    /** Conservative: 1 SUI/tx, 10 SUI/day, business hours only */
    conservative: (recipients) => ({
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
    moderate: (recipients) => ({
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
    aggressive: () => ({
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
    unlimited: () => ({
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
    deepbook: (pool, maxPrice, minPrice) => ({
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
};
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
];
