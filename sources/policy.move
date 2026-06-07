/// SuiVault — Policy Module
///
/// Defines the spending policy rules and enforcement logic.
/// All policy validation happens on-chain inside Move — no off-chain trust required.
/// Policies are embedded inside Vault objects (not separate objects).
module suivault::policy;

use std::string::String;

// ============================================================
// Error Constants
// ============================================================

/// Spend amount exceeds per-transaction limit
const EExceedsPerTxLimit: u64 = 100;
/// Spend would exceed daily budget
const EExceedsDailyLimit: u64 = 101;
/// Recipient is not in the whitelist
const ERecipientNotWhitelisted: u64 = 102;
/// Current time is outside active hours
const EOutsideActiveHours: u64 = 103;
/// Invalid active hours configuration
const EInvalidActiveHours: u64 = 104;
/// Price is too high compared to DeepBook policy max limit
const EPriceTooHigh: u64 = 105;
/// Price is too low compared to DeepBook policy min limit
const EPriceTooLow: u64 = 106;
/// Invalid DeepBook Pool address
const EInvalidDeepBookPool: u64 = 107;

// ============================================================
// Policy Struct
// ============================================================

/// Policy defines the spending rules for a vault.
/// All rules are checked on every spend attempt.
/// Rules with zero values or empty vectors are treated as "no limit".
public struct Policy has store, copy, drop {
    /// Maximum amount allowed per single transaction (0 = no limit)
    max_per_tx: u64,
    /// Maximum total amount allowed per day (0 = no limit)
    max_per_day: u64,
    /// Whitelisted recipient addresses (empty = allow all)
    allowed_recipients: vector<address>,
    /// Start of allowed activity hours (0-23, UTC). 
    /// Only enforced if active_hours_start != active_hours_end.
    active_hours_start: u8,
    /// End of allowed activity hours (0-23, UTC).
    /// Only enforced if active_hours_start != active_hours_end.
    active_hours_end: u8,
    /// Whether this policy restricts the agent to DeepBook only
    is_deepbook_only: bool,
    /// The DeepBook SUI/USDC pool address (or other asset pool)
    deepbook_pool: address,
    /// Maximum price limit for trading (e.g. limit order safety threshold)
    max_price: u64,
    /// Minimum price limit for trading
    min_price: u64,
}

// ============================================================
// Policy Creation
// ============================================================

/// Create a new Policy with the specified rules.
///
/// # Arguments
/// * `max_per_tx` - Max spend per transaction (0 = unlimited)
/// * `max_per_day` - Max spend per day (0 = unlimited)
/// * `allowed_recipients` - Whitelisted addresses (empty = allow all)
/// * `active_hours_start` - Start hour UTC (0-23)
/// * `active_hours_end` - End hour UTC (0-23)
/// * `is_deepbook_only` - Restrict to DeepBook
/// * `deepbook_pool` - Address of DeepBook pool
/// * `max_price` - Safe max order price
/// * `min_price` - Safe min order price
public fun create_policy(
    max_per_tx: u64,
    max_per_day: u64,
    allowed_recipients: vector<address>,
    active_hours_start: u8,
    active_hours_end: u8,
    is_deepbook_only: bool,
    deepbook_pool: address,
    max_price: u64,
    min_price: u64,
): Policy {
    // Validate hours are in range
    assert!(active_hours_start < 24 && active_hours_end < 24, EInvalidActiveHours);

    Policy {
        max_per_tx,
        max_per_day,
        allowed_recipients,
        active_hours_start,
        active_hours_end,
        is_deepbook_only,
        deepbook_pool,
        max_price,
        min_price,
    }
}

/// Create a permissive policy with no restrictions.
/// Useful for trusted agents or testing.
public fun create_unlimited_policy(): Policy {
    Policy {
        max_per_tx: 0,
        max_per_day: 0,
        allowed_recipients: vector[],
        active_hours_start: 0,
        active_hours_end: 0,
        is_deepbook_only: false,
        deepbook_pool: @0x0,
        max_price: 0,
        min_price: 0,
    }
}

// ============================================================
// Policy Validation
// ============================================================

/// Validate a spend attempt against all policy rules.
/// Aborts with a specific error code if any rule is violated.
///
/// # Arguments
/// * `policy` - The policy to check against
/// * `amount` - Amount the agent wants to spend
/// * `today_spent` - How much has already been spent today
/// * `recipient` - Where the funds are going
/// * `now_ms` - Current timestamp in milliseconds
public fun validate_spend(
    policy: &Policy,
    amount: u64,
    today_spent: u64,
    recipient: address,
    now_ms: u64,
) {
    // Check 1: Per-transaction limit
    check_per_tx_limit(policy, amount);

    // Check 2: Daily budget
    check_daily_limit(policy, amount, today_spent);

    // Check 3: Recipient whitelist
    check_recipient_whitelist(policy, recipient);

    // Check 4: Active hours
    check_active_hours(policy, now_ms);

    // Check 5: DeepBook pool restriction (if enabled, recipient must be the pool)
    if (policy.is_deepbook_only) {
        assert!(recipient == policy.deepbook_pool, ERecipientNotWhitelisted);
    };
}

/// Validate a DeepBook order price and pool matching constraints.
public fun validate_deepbook_order(
    policy: &Policy,
    pool: address,
    price: u64,
) {
    if (policy.is_deepbook_only) {
        assert!(pool == policy.deepbook_pool, EInvalidDeepBookPool);
        if (policy.max_price > 0) {
            assert!(price <= policy.max_price, EPriceTooHigh);
        };
        if (policy.min_price > 0) {
            assert!(price >= policy.min_price, EPriceTooLow);
        };
    };
}

// ============================================================
// Individual Policy Checks
// ============================================================

/// Check if amount is within per-transaction limit
public fun check_per_tx_limit(policy: &Policy, amount: u64) {
    // 0 means no limit
    if (policy.max_per_tx > 0) {
        assert!(amount <= policy.max_per_tx, EExceedsPerTxLimit);
    };
}

/// Check if amount would exceed daily spending limit
public fun check_daily_limit(policy: &Policy, amount: u64, today_spent: u64) {
    // 0 means no limit
    if (policy.max_per_day > 0) {
        assert!(today_spent + amount <= policy.max_per_day, EExceedsDailyLimit);
    };
}

/// Check if recipient is in the whitelist
public fun check_recipient_whitelist(policy: &Policy, recipient: address) {
    // Empty whitelist means allow all
    if (!vector::is_empty(&policy.allowed_recipients)) {
        assert!(vector::contains(&policy.allowed_recipients, &recipient), ERecipientNotWhitelisted);
    };
}

/// Check if the current time is within active hours
public fun check_active_hours(policy: &Policy, now_ms: u64) {
    // If start == end, hours are unrestricted
    if (policy.active_hours_start == policy.active_hours_end) {
        return
    };

    let current_hour = ms_to_utc_hour(now_ms);

    if (policy.active_hours_start < policy.active_hours_end) {
        // Normal range (e.g., 9-17 means 9am to 5pm)
        assert!(
            current_hour >= policy.active_hours_start && current_hour < policy.active_hours_end,
            EOutsideActiveHours,
        );
    } else {
        // Overnight range (e.g., 22-6 means 10pm to 6am)
        assert!(
            current_hour >= policy.active_hours_start || current_hour < policy.active_hours_end,
            EOutsideActiveHours,
        );
    };
}

// ============================================================
// View Functions
// ============================================================

/// Get the per-transaction limit
public fun max_per_tx(policy: &Policy): u64 {
    policy.max_per_tx
}

/// Get the daily spending limit
public fun max_per_day(policy: &Policy): u64 {
    policy.max_per_day
}

/// Get the list of allowed recipients
public fun allowed_recipients(policy: &Policy): &vector<address> {
    &policy.allowed_recipients
}

/// Get the active hours start
public fun active_hours_start(policy: &Policy): u8 {
    policy.active_hours_start
}

/// Get the active hours end
public fun active_hours_end(policy: &Policy): u8 {
    policy.active_hours_end
}

/// Check if policy is DeepBook only
public fun is_deepbook_only(policy: &Policy): bool {
    policy.is_deepbook_only
}

/// Get DeepBook pool address
public fun deepbook_pool(policy: &Policy): address {
    policy.deepbook_pool
}

/// Get max price threshold for DeepBook orders
public fun max_price(policy: &Policy): u64 {
    policy.max_price
}

/// Get min price threshold for DeepBook orders
public fun min_price(policy: &Policy): u64 {
    policy.min_price
}

/// Check if a specific recipient is whitelisted (or if whitelist is empty = all allowed)
public fun is_recipient_allowed(policy: &Policy, recipient: address): bool {
    if (vector::is_empty(&policy.allowed_recipients)) {
        true
    } else {
        vector::contains(&policy.allowed_recipients, &recipient)
    }
}

/// Check if the policy has any time restrictions
public fun has_time_restrictions(policy: &Policy): bool {
    policy.active_hours_start != policy.active_hours_end
}

/// Get the human-readable description of a policy violation
public fun violation_reason_per_tx(): String {
    std::string::utf8(b"Amount exceeds per-transaction limit")
}

public fun violation_reason_daily(): String {
    std::string::utf8(b"Amount would exceed daily spending limit")
}

public fun violation_reason_recipient(): String {
    std::string::utf8(b"Recipient not in whitelist")
}

public fun violation_reason_hours(): String {
    std::string::utf8(b"Outside active hours")
}

// ============================================================
// Internal Helpers
// ============================================================

/// Convert a millisecond timestamp to UTC hour (0-23)
fun ms_to_utc_hour(timestamp_ms: u64): u8 {
    // Convert ms to seconds, then to hours, then mod 24
    let seconds = timestamp_ms / 1000;
    let hours = seconds / 3600;
    let hour_of_day = hours % 24;
    (hour_of_day as u8)
}

// ============================================================
// Test-Only Functions
// ============================================================

#[test_only]
/// Create a policy for testing with specific per-tx and daily limits
public fun create_test_policy(max_per_tx: u64, max_per_day: u64): Policy {
    create_policy(max_per_tx, max_per_day, vector[], 0, 0, false, @0x0, 0, 0)
}

#[test_only]
/// Test helper to convert ms to hour
public fun test_ms_to_utc_hour(timestamp_ms: u64): u8 {
    ms_to_utc_hour(timestamp_ms)
}
