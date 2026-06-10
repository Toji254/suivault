/// SuiVault — Comprehensive Unit Tests
#[test_only]
module suivault::vault_tests;

use sui::test_scenario;
use sui::coin;
use sui::clock;
use sui::sui::SUI;
use std::string;
use suivault::vault::{Self, Vault, VaultKey, VaultOwnerCap};

// ============================================================
// Constants
// ============================================================

const OWNER: address = @0xA;
const AGENT: address = @0xB;
const RECIPIENT: address = @0xC;
const RANDOM_ADDR: address = @0xD;

// 1 SUI = 1_000_000_000 MIST
const ONE_SUI: u64 = 1_000_000_000;
const TEN_SUI: u64 = 10_000_000_000;
const HUNDRED_SUI: u64 = 100_000_000_000;

// Time constants
const ONE_HOUR_MS: u64 = 3_600_000;
const ONE_DAY_MS: u64 = 86_400_000;
const SEVEN_DAYS_MS: u64 = 604_800_000;

// ============================================================
// Helper: Create a standard vault for testing
// ============================================================

fun setup_vault(scenario: &mut test_scenario::Scenario): (clock::Clock) {
    let ctx = test_scenario::ctx(scenario);
    let mut test_clock = clock::create_for_testing(ctx);
    // Set to noon UTC (12:00) so active hours tests work
    test_clock.set_for_testing(12 * ONE_HOUR_MS);

    let coin = coin::mint_for_testing<SUI>(HUNDRED_SUI, ctx);

    vault::create_vault_entry<SUI>(
        coin,
        string::utf8(b"Test Vault"),
        AGENT,
        string::utf8(b"Test Agent"),
        SEVEN_DAYS_MS,       // key valid for 7 days
        TEN_SUI,             // max 10 SUI per tx
        HUNDRED_SUI,         // max 100 SUI per day
        vector[RECIPIENT],   // only RECIPIENT whitelisted
        9,                   // active from 9 UTC
        17,                  // active until 17 UTC
        false,               // is_deepbook_only
        @0x0,                // deepbook_pool
        0,                   // max_price
        0,                   // min_price
        &test_clock,
        ctx,
    );

    test_clock
}

// ============================================================
// Test: Vault Creation
// ============================================================

#[test]
fun test_create_vault() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    // Next tx: verify vault exists as shared object
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        assert!(vault::vault_balance(&vault) == HUNDRED_SUI);
        assert!(vault::vault_owner(&vault) == OWNER);
        assert!(vault::is_frozen(&vault) == false);
        assert!(vault::has_active_key(&vault) == true);
        assert!(vault::total_spent(&vault) == 0);
        assert!(vault::today_spent(&vault) == 0);
        test_scenario::return_shared(vault);
    };

    // Verify owner got the VaultOwnerCap
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);
        test_scenario::return_to_sender(&scenario, cap);
    };

    // Verify agent got the VaultKey
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let key = test_scenario::take_from_sender<VaultKey>(&scenario);
        assert!(vault::key_agent_address(&key) == AGENT);
        assert!(vault::is_key_expired(&key, &test_clock) == false);
        test_scenario::return_to_sender(&scenario, key);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Successful Spend
// ============================================================

#[test]
fun test_spend_success() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    // Agent spends 5 SUI to whitelisted RECIPIENT
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            5 * ONE_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        assert!(vault::vault_balance(&vault) == HUNDRED_SUI - 5 * ONE_SUI);
        assert!(vault::today_spent(&vault) == 5 * ONE_SUI);
        assert!(vault::total_spent(&vault) == 5 * ONE_SUI);
        assert!(vault::key_reputation_score(&key) == 1);

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Spend blocked — exceeds per-tx limit
// ============================================================

#[test, expected_failure(abort_code = suivault::policy::EExceedsPerTxLimit)]
fun test_spend_exceeds_per_tx_limit() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        // Try to spend 20 SUI (limit is 10 SUI per tx)
        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            20 * ONE_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Spend blocked — exceeds daily limit
// ============================================================

#[test, expected_failure(abort_code = suivault::policy::EExceedsDailyLimit)]
fun test_spend_exceeds_daily_limit() {
    let mut scenario = test_scenario::begin(OWNER);
    let mut test_clock = setup_vault(&mut scenario);

    // First: spend 95 SUI in chunks of 9.5 SUI (10 txs)
    let mut i = 0u64;
    while (i < 10) {
        test_scenario::next_tx(&mut scenario, AGENT);
        {
            let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
            let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

            vault::spend_to<SUI>(
                &mut vault,
                &mut key,
                9 * ONE_SUI + ONE_SUI / 2, // 9.5 SUI
                RECIPIENT,
                &test_clock,
                string::utf8(b""),
                test_scenario::ctx(&mut scenario),
            );

            test_scenario::return_to_sender(&scenario, key);
            test_scenario::return_shared(vault);
        };
        // Advance clock slightly to avoid identical timestamps
        test_clock.increment_for_testing(1000);
        i = i + 1;
    };

    // Now try spending 10 more SUI — should exceed daily limit of 100
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            TEN_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Spend blocked — recipient not whitelisted
// ============================================================

#[test, expected_failure(abort_code = suivault::policy::ERecipientNotWhitelisted)]
fun test_spend_recipient_not_whitelisted() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        // Try to spend to RANDOM_ADDR (not whitelisted)
        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            ONE_SUI,
            RANDOM_ADDR,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Spend blocked — outside active hours
// ============================================================

#[test, expected_failure(abort_code = suivault::policy::EOutsideActiveHours)]
fun test_spend_outside_active_hours() {
    let mut scenario = test_scenario::begin(OWNER);
    let mut test_clock = setup_vault(&mut scenario);

    // Set clock to 2 AM UTC (outside 9-17 window)
    test_clock.set_for_testing(ONE_DAY_MS + 2 * ONE_HOUR_MS);

    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            ONE_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Spend blocked — vault frozen (kill switch)
// ============================================================

#[test, expected_failure(abort_code = vault::EVaultFrozen)]
fun test_spend_vault_frozen() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    // Owner freezes the vault
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);

        vault::freeze_vault<SUI>(&mut vault, &cap, &test_clock, test_scenario::ctx(&mut scenario));
        assert!(vault::is_frozen(&vault) == true);

        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(vault);
    };

    // Agent tries to spend — should fail
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            ONE_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Spend blocked — key expired
// ============================================================

#[test, expected_failure(abort_code = vault::EKeyExpired)]
fun test_spend_key_expired() {
    let mut scenario = test_scenario::begin(OWNER);
    let mut test_clock = setup_vault(&mut scenario);

    // Fast-forward clock past key expiry (7 days + 1 hour)
    test_clock.set_for_testing(SEVEN_DAYS_MS + 13 * ONE_HOUR_MS);

    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        assert!(vault::is_key_expired(&key, &test_clock) == true);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            ONE_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Spend blocked — wrong agent
// ============================================================

#[test, expected_failure(abort_code = vault::ENotAgent)]
fun test_spend_wrong_agent() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    // Transfer key to agent first, then have RANDOM_ADDR try to use it
    // Actually, RANDOM_ADDR won't have the key. Let's test by having
    // OWNER try to use the agent's key (key checks sender == agent_address)
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let key = test_scenario::take_from_sender<VaultKey>(&scenario);
        // Transfer key to RANDOM_ADDR
        transfer::public_transfer(key, RANDOM_ADDR);
    };

    test_scenario::next_tx(&mut scenario, RANDOM_ADDR);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            ONE_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Freeze and Unfreeze
// ============================================================

#[test]
fun test_freeze_and_unfreeze() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    // Freeze
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);

        vault::freeze_vault<SUI>(&mut vault, &cap, &test_clock, test_scenario::ctx(&mut scenario));
        assert!(vault::is_frozen(&vault) == true);

        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(vault);
    };

    // Unfreeze
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);

        vault::unfreeze_vault<SUI>(&mut vault, &cap, &test_clock, test_scenario::ctx(&mut scenario));
        assert!(vault::is_frozen(&vault) == false);

        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(vault);
    };

    // Agent can spend again after unfreeze
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            ONE_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        assert!(vault::vault_balance(&vault) == HUNDRED_SUI - ONE_SUI);

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Owner Deposit
// ============================================================

#[test]
fun test_deposit() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);

        let extra_coin = coin::mint_for_testing<SUI>(50 * ONE_SUI, test_scenario::ctx(&mut scenario));
        vault::deposit<SUI>(&mut vault, &cap, extra_coin, &test_clock, test_scenario::ctx(&mut scenario));

        assert!(vault::vault_balance(&vault) == HUNDRED_SUI + 50 * ONE_SUI);

        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Owner Withdraw
// ============================================================

#[test]
fun test_withdraw() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);

        vault::withdraw<SUI>(
            &mut vault,
            &cap,
            30 * ONE_SUI,
            &test_clock,
            test_scenario::ctx(&mut scenario),
        );

        assert!(vault::vault_balance(&vault) == HUNDRED_SUI - 30 * ONE_SUI);

        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Revoke Key
// ============================================================

#[test]
fun test_revoke_key() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    // Agent transfers key to owner for revocation
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let key = test_scenario::take_from_sender<VaultKey>(&scenario);
        transfer::public_transfer(key, OWNER);
    };

    // Owner revokes the key
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);
        let key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::revoke_key<SUI>(&mut vault, &cap, key, &test_clock, test_scenario::ctx(&mut scenario));
        assert!(vault::has_active_key(&vault) == false);

        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Issue new key after revocation
// ============================================================

#[test]
fun test_issue_new_key_after_revoke() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    // Transfer key to owner for revocation
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let key = test_scenario::take_from_sender<VaultKey>(&scenario);
        transfer::public_transfer(key, OWNER);
    };

    // Revoke the key
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);
        let key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::revoke_key<SUI>(&mut vault, &cap, key, &test_clock, test_scenario::ctx(&mut scenario));

        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(vault);
    };

    // Issue new key to a different agent
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);

        vault::issue_new_key_entry<SUI>(
            &mut vault,
            &cap,
            RANDOM_ADDR,
            string::utf8(b"New Agent"),
            SEVEN_DAYS_MS,
            &test_clock,
            test_scenario::ctx(&mut scenario),
        );

        assert!(vault::has_active_key(&vault) == true);

        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Daily spending resets after 24 hours
// ============================================================

#[test]
fun test_daily_reset() {
    let mut scenario = test_scenario::begin(OWNER);
    let mut test_clock = setup_vault(&mut scenario);

    // Spend 9 SUI
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            9 * ONE_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        assert!(vault::today_spent(&vault) == 9 * ONE_SUI);

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    // Advance clock by more than 24 hours (to noon next day, still in active hours)
    test_clock.set_for_testing(ONE_DAY_MS + 12 * ONE_HOUR_MS);

    // Spend again — daily counter should have reset
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            5 * ONE_SUI,
            RECIPIENT,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        // Daily spent should be just 5 SUI (reset happened)
        assert!(vault::today_spent(&vault) == 5 * ONE_SUI);
        // But total spent is cumulative
        assert!(vault::total_spent(&vault) == 14 * ONE_SUI);

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: Update policy
// ============================================================

#[test]
fun test_update_policy() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    // Owner updates policy to remove whitelist and increase limits
    test_scenario::next_tx(&mut scenario, OWNER);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let cap = test_scenario::take_from_sender<VaultOwnerCap>(&scenario);

        vault::update_policy<SUI>(
            &mut vault,
            &cap,
            50 * ONE_SUI,       // new max per tx
            500 * ONE_SUI,      // new max per day
            vector[],           // empty = allow all recipients
            0,                  // no time restriction
            0,
            false,              // is_deepbook_only
            @0x0,               // deepbook_pool
            0,                  // max_price
            0,                  // min_price
            &test_clock,
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, cap);
        test_scenario::return_shared(vault);
    };

    // Agent can now spend to RANDOM_ADDR (was previously blocked)
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            ONE_SUI,
            RANDOM_ADDR,  // was not whitelisted before, now allowed
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

// ============================================================
// Test: DeepBook trading policy enforcement
// ============================================================

#[test]
fun test_deepbook_policy_enforcement() {
    let mut scenario = test_scenario::begin(OWNER);
    let ctx = test_scenario::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);
    test_clock.set_for_testing(12 * ONE_HOUR_MS);

    let coin = coin::mint_for_testing<SUI>(HUNDRED_SUI, ctx);
    let pool_address = @0xDEEB;

    // Create vault with DeepBook trading policy: SUI/USDC Pool @0xDEEB, price safe range [10, 100]
    vault::create_vault_entry<SUI>(
        coin,
        string::utf8(b"DeepBook Vault"),
        AGENT,
        string::utf8(b"DeFi Agent"),
        SEVEN_DAYS_MS,
        TEN_SUI,
        HUNDRED_SUI,
        vector[], // no whitelist, we rely on deepbook pool filter
        0,
        0,
        true,          // is_deepbook_only
        pool_address,  // deepbook_pool
        100,           // max_price
        10,            // min_price
        &test_clock,
        ctx,
    );

    // Test Case 1: Agent spends specifically for a valid DeepBook order
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        // Price = 50, which is within [10, 100], and pool = @0xDEEB
        let order_coin = vault::spend_for_deepbook_order<SUI>(
            &mut vault,
            &mut key,
            5 * ONE_SUI,
            pool_address,
            50,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        assert!(coin::value(&order_coin) == 5 * ONE_SUI, 1);
        coin::burn_for_testing(order_coin);

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = suivault::policy::ERecipientNotWhitelisted)]
fun test_deepbook_blocked_wrong_recipient() {
    let mut scenario = test_scenario::begin(OWNER);
    let ctx = test_scenario::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);
    test_clock.set_for_testing(12 * ONE_HOUR_MS);

    let coin = coin::mint_for_testing<SUI>(HUNDRED_SUI, ctx);
    let pool_address = @0xDEEB;

    vault::create_vault_entry<SUI>(
        coin,
        string::utf8(b"DeepBook Vault"),
        AGENT,
        string::utf8(b"DeFi Agent"),
        SEVEN_DAYS_MS,
        TEN_SUI,
        HUNDRED_SUI,
        vector[],
        0,
        0,
        true,
        pool_address,
        100,
        10,
        &test_clock,
        ctx,
    );

    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        // Standard spend to RANDOM_ADDR should fail
        vault::spend_to<SUI>(
            &mut vault,
            &mut key,
            ONE_SUI,
            RANDOM_ADDR,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

#[test, expected_failure(abort_code = suivault::policy::EPriceTooHigh)]
fun test_deepbook_blocked_price_too_high() {
    let mut scenario = test_scenario::begin(OWNER);
    let ctx = test_scenario::ctx(&mut scenario);
    let mut test_clock = clock::create_for_testing(ctx);
    test_clock.set_for_testing(12 * ONE_HOUR_MS);

    let coin = coin::mint_for_testing<SUI>(HUNDRED_SUI, ctx);
    let pool_address = @0xDEEB;

    vault::create_vault_entry<SUI>(
        coin,
        string::utf8(b"DeepBook Vault"),
        AGENT,
        string::utf8(b"DeFi Agent"),
        SEVEN_DAYS_MS,
        TEN_SUI,
        HUNDRED_SUI,
        vector[],
        0,
        0,
        true,
        pool_address,
        100,
        10,
        &test_clock,
        ctx,
    );

    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let mut vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let mut key = test_scenario::take_from_sender<VaultKey>(&scenario);

        // Price = 150 (exceeds max 100) — should fail
        let order_coin = vault::spend_for_deepbook_order<SUI>(
            &mut vault,
            &mut key,
            ONE_SUI,
            pool_address,
            150,
            &test_clock,
            string::utf8(b""),
            test_scenario::ctx(&mut scenario),
        );

        coin::burn_for_testing(order_coin);
        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}

#[test]
fun test_log_blocked_spend_and_reputation() {
    let mut scenario = test_scenario::begin(OWNER);
    let test_clock = setup_vault(&mut scenario);

    // Test log_blocked_spend
    test_scenario::next_tx(&mut scenario, AGENT);
    {
        let vault = test_scenario::take_shared<Vault<SUI>>(&scenario);
        let key = test_scenario::take_from_sender<VaultKey>(&scenario);

        vault::log_blocked_spend<SUI>(
            &vault,
            &key,
            1000,
            RECIPIENT,
            &test_clock,
            string::utf8(b"AI Guardian: high risk score"),
            string::utf8(b"walrus-blob-id-123"),
            test_scenario::ctx(&mut scenario),
        );

        test_scenario::return_to_sender(&scenario, key);
        test_scenario::return_shared(vault);
    };

    test_clock.destroy_for_testing();
    test_scenario::end(scenario);
}
