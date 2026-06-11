/// SuiVault — Core Vault Module
/// 
/// Provides the main Vault object that holds funds for AI agents,
/// and VaultKey objects that agents use as their "debit card".
/// All spending is policy-checked and audit-logged.
#[allow(unused_field, lint(self_transfer))]
module suivault::vault;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::clock::Clock;
use sui::event;
use std::string::String;
use suivault::policy::{Self, Policy};
use suivault::audit;

// ============================================================
// Error Constants
// ============================================================

/// Caller is not the vault owner
const ENotOwner: u64 = 0;
/// Vault is currently frozen (kill switch active)
const EVaultFrozen: u64 = 1;
/// VaultKey does not match this vault
const EKeyVaultMismatch: u64 = 2;
/// VaultKey has expired
const EKeyExpired: u64 = 3;
/// Insufficient balance in vault
const EInsufficientBalance: u64 = 4;
/// Vault already has an active key issued
const EKeyAlreadyIssued: u64 = 5;
/// Vault has no active key to revoke
const ENoActiveKey: u64 = 6;
/// Caller is not the authorized agent
const ENotAgent: u64 = 7;
/// VaultKey is no longer the vault's currently active key
const EInactiveKey: u64 = 8;

// ============================================================
// One-Time Witness for Package Initialization
// ============================================================

public struct VAULT has drop {}

// ============================================================
// Core Objects
// ============================================================

/// A vault that holds funds for an AI agent with policy-enforced spending.
/// The vault is owned by a human who sets the rules.
/// The agent receives a VaultKey to spend from this vault.
public struct Vault<phantom T> has key, store {
    id: UID,
    /// Address of the human who owns and controls this vault
    owner: address,
    /// Funds held in the vault
    balance: Balance<T>,
    /// Spending policy rules
    policy: Policy,
    /// Object ID of the VaultKey issued to the agent (if any)
    agent_key_id: Option<ID>,
    /// Human-readable name for this vault
    name: String,
    /// Total amount spent from this vault (lifetime)
    total_spent: u64,
    /// Amount spent today (resets daily)
    today_spent: u64,
    /// Timestamp (ms) of last daily reset
    last_reset_ms: u64,
    /// Timestamp (ms) when vault was created
    created_at_ms: u64,
    /// Kill switch — if true, all spending is blocked
    is_frozen: bool,
}

/// The agent's "debit card" — proves authorization to spend from a Vault.
/// The agent holds this object in their address.
/// Without a valid VaultKey, no spending is possible.
public struct VaultKey has key, store {
    id: UID,
    /// ID of the Vault this key unlocks
    vault_id: ID,
    /// Address of the agent authorized to use this key
    agent_address: address,
    /// Timestamp (ms) when this key expires
    expires_at_ms: u64,
    /// Human-readable name for the agent
    agent_name: String,
    /// Timestamp (ms) when this key was issued
    issued_at_ms: u64,
    /// Total successful spends performed by this agent key
    reputation_score: u64,
}

/// Administrative capability for the vault owner.
/// Created once per vault, held by the owner.
public struct VaultOwnerCap has key, store {
    id: UID,
    /// ID of the Vault this cap controls
    vault_id: ID,
}

// ============================================================
// Events
// ============================================================

/// Emitted when a new vault is created
public struct VaultCreated has copy, drop {
    vault_id: ID,
    owner: address,
    name: String,
    initial_balance: u64,
}

/// Emitted when a VaultKey is issued to an agent
public struct KeyIssued has copy, drop {
    vault_id: ID,
    key_id: ID,
    agent_address: address,
    agent_name: String,
    expires_at_ms: u64,
}

/// Emitted when a spend is approved
public struct SpendApproved has copy, drop {
    vault_id: ID,
    agent_address: address,
    amount: u64,
    recipient: address,
    remaining_balance: u64,
    daily_spent: u64,
}

/// Emitted when a spend is blocked by policy
public struct SpendBlocked has copy, drop {
    vault_id: ID,
    agent_address: address,
    amount: u64,
    reason: String,
}

/// Emitted when the vault is frozen
public struct VaultFrozen has copy, drop {
    vault_id: ID,
    frozen_by: address,
}

/// Emitted when the vault is unfrozen
public struct VaultUnfrozen has copy, drop {
    vault_id: ID,
    unfrozen_by: address,
}

/// Emitted when funds are deposited
public struct FundsDeposited has copy, drop {
    vault_id: ID,
    amount: u64,
    new_balance: u64,
    deposited_by: address,
}

/// Emitted when funds are withdrawn by owner
public struct FundsWithdrawn has copy, drop {
    vault_id: ID,
    amount: u64,
    remaining_balance: u64,
    withdrawn_by: address,
}

/// Emitted when a VaultKey is revoked
public struct KeyRevoked has copy, drop {
    vault_id: ID,
    key_id: ID,
    revoked_by: address,
}

// ============================================================
// Constants
// ============================================================

/// Milliseconds in one day (24 * 60 * 60 * 1000)
const MS_PER_DAY: u64 = 86_400_000;

// ============================================================
// Public Functions — Vault Lifecycle
// ============================================================

/// Create a new vault, deposit initial funds, and issue a VaultKey to the agent.
/// This is the primary entry point — does everything in one atomic transaction.
///
/// # Arguments
/// * `coin` - Initial funds to deposit
/// * `name` - Human-readable vault name
/// * `agent_address` - Address of the AI agent receiving the key
/// * `agent_name` - Human-readable name for the agent
/// * `key_duration_ms` - How long the key is valid (in milliseconds)
/// * `max_per_tx` - Maximum spend per transaction (in token base units)
/// * `max_per_day` - Maximum spend per day (in token base units)
/// * `allowed_recipients` - Whitelisted recipient addresses
/// * `active_hours_start` - Start of allowed hours (0-23 UTC)
/// * `active_hours_end` - End of allowed hours (0-23 UTC)
/// * `clock` - Sui system Clock object
/// * `ctx` - Transaction context
public fun create_vault_and_issue_key<T>(
    coin: Coin<T>,
    name: String,
    agent_address: address,
    agent_name: String,
    key_duration_ms: u64,
    max_per_tx: u64,
    max_per_day: u64,
    allowed_recipients: vector<address>,
    active_hours_start: u8,
    active_hours_end: u8,
    is_deepbook_only: bool,
    deepbook_pool: address,
    max_price: u64,
    min_price: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): (VaultOwnerCap, VaultKey) {
    let now_ms = clock.timestamp_ms();
    let initial_balance = coin.value();
    let vault_uid = object::new(ctx);
    let vault_id = vault_uid.to_inner();

    // Create the policy
    let vault_policy = policy::create_policy(
        max_per_tx,
        max_per_day,
        allowed_recipients,
        active_hours_start,
        active_hours_end,
        is_deepbook_only,
        deepbook_pool,
        max_price,
        min_price,
    );

    // Create the VaultKey
    let key_uid = object::new(ctx);
    let key_id = key_uid.to_inner();

    let key = VaultKey {
        id: key_uid,
        vault_id,
        agent_address,
        expires_at_ms: now_ms + key_duration_ms,
        agent_name,
        issued_at_ms: now_ms,
        reputation_score: 0,
    };

    // Create the vault
    let vault = Vault<T> {
        id: vault_uid,
        owner: ctx.sender(),
        balance: coin::into_balance(coin),
        policy: vault_policy,
        agent_key_id: option::some(key_id),
        name,
        total_spent: 0,
        today_spent: 0,
        last_reset_ms: now_ms,
        created_at_ms: now_ms,
        is_frozen: false,
    };

    // Create owner capability
    let owner_cap = VaultOwnerCap {
        id: object::new(ctx),
        vault_id,
    };

    // Emit events
    event::emit(VaultCreated {
        vault_id,
        owner: ctx.sender(),
        name: vault.name,
        initial_balance,
    });

    event::emit(KeyIssued {
        vault_id,
        key_id,
        agent_address,
        agent_name: key.agent_name,
        expires_at_ms: key.expires_at_ms,
    });

    // Log key issuance to audit
    let audit_entry = audit::log_key_issued(
        vault_id,
        ctx.sender(),
        agent_address,
        now_ms,
        ctx,
    );
    transfer::public_share_object(audit_entry);

    // Share the vault so both owner and agent can access it
    transfer::public_share_object(vault);

    (owner_cap, key)
}

/// Entry function wrapper — creates vault and transfers cap/key to respective addresses
public fun create_vault_entry<T>(
    coin: Coin<T>,
    name: String,
    agent_address: address,
    agent_name: String,
    key_duration_ms: u64,
    max_per_tx: u64,
    max_per_day: u64,
    allowed_recipients: vector<address>,
    active_hours_start: u8,
    active_hours_end: u8,
    is_deepbook_only: bool,
    deepbook_pool: address,
    max_price: u64,
    min_price: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let (owner_cap, key) = create_vault_and_issue_key<T>(
        coin,
        name,
        agent_address,
        agent_name,
        key_duration_ms,
        max_per_tx,
        max_per_day,
        allowed_recipients,
        active_hours_start,
        active_hours_end,
        is_deepbook_only,
        deepbook_pool,
        max_price,
        min_price,
        clock,
        ctx,
    );

    // Transfer owner cap to the vault creator
    transfer::public_transfer(owner_cap, ctx.sender());
    // Transfer key to the agent
    transfer::public_transfer(key, agent_address);
}

// ============================================================
// Public Functions — Agent Spending
// ============================================================

/// Agent spends funds from the vault. All policy rules are enforced.
/// Returns the withdrawn coin if successful.
///
/// # Policy Checks (in order)
/// 1. Vault is not frozen
/// 2. VaultKey matches this vault
/// 3. VaultKey is not expired
/// 4. Amount does not exceed per-transaction limit
/// 5. Amount does not exceed remaining daily budget
/// 6. Recipient is whitelisted (if whitelist is non-empty)
/// 7. Current time is within active hours (if configured)
///
/// If any check fails, the transaction aborts and a SpendBlocked event is emitted.
public fun spend<T>(
    vault: &mut Vault<T>,
    key: &mut VaultKey,
    amount: u64,
    recipient: address,
    clock: &Clock,
    walrus_blob_id: String,
    ctx: &mut TxContext,
): Coin<T> {
    let now_ms = clock.timestamp_ms();
    let vault_id = object::id(vault);

    // --- Pre-checks ---

    // 1. Vault must not be frozen
    assert!(!vault.is_frozen, EVaultFrozen);

    // 2. Key must match this vault
    assert!(key.vault_id == vault_id, EKeyVaultMismatch);
    assert_active_key(vault, key);

    // 3. Key must not be expired
    assert!(now_ms < key.expires_at_ms, EKeyExpired);

    // 4. Caller must be the authorized agent
    assert!(ctx.sender() == key.agent_address, ENotAgent);

    // 5. Reset daily spending if new day
    maybe_reset_daily(vault, now_ms);

    // 6. Check all policy rules
    policy::validate_spend(
        &vault.policy,
        amount,
        vault.today_spent,
        recipient,
        now_ms,
    );

    // 7. Check sufficient balance
    assert!(balance::value(&vault.balance) >= amount, EInsufficientBalance);

    // --- Execute spend ---

    // Update tracking
    vault.today_spent = vault.today_spent + amount;
    vault.total_spent = vault.total_spent + amount;

    // Increment agent reputation score on successful spend
    key.reputation_score = key.reputation_score + 1;

    // Withdraw funds
    let withdrawn = balance::split(&mut vault.balance, amount);
    let coin = coin::from_balance(withdrawn, ctx);

    // Emit success event
    event::emit(SpendApproved {
        vault_id,
        agent_address: key.agent_address,
        amount,
        recipient,
        remaining_balance: balance::value(&vault.balance),
        daily_spent: vault.today_spent,
    });

    // Log spend approved to audit
    let audit_entry = audit::log_spend_approved(
        vault_id,
        key.agent_address,
        amount,
        recipient,
        now_ms,
        walrus_blob_id,
        ctx,
    );
    transfer::public_share_object(audit_entry);

    coin
}

/// Entry function wrapper — spends and transfers directly to recipient
public fun spend_to<T>(
    vault: &mut Vault<T>,
    key: &mut VaultKey,
    amount: u64,
    recipient: address,
    clock: &Clock,
    walrus_blob_id: String,
    ctx: &mut TxContext,
) {
    let coin = spend(vault, key, amount, recipient, clock, walrus_blob_id, ctx);
    transfer::public_transfer(coin, recipient);
}

/// Agent spends funds specifically for placing a DeepBook limit order.
/// All general and DeepBook constraints are verified.
public fun spend_for_deepbook_order<T>(
    vault: &mut Vault<T>,
    key: &mut VaultKey,
    amount: u64,
    pool: address,
    price: u64,
    clock: &Clock,
    walrus_blob_id: String,
    ctx: &mut TxContext,
): Coin<T> {
    let now_ms = clock.timestamp_ms();
    let vault_id = object::id(vault);

    // --- Pre-checks ---
    assert!(!vault.is_frozen, EVaultFrozen);
    assert!(key.vault_id == vault_id, EKeyVaultMismatch);
    assert_active_key(vault, key);
    assert!(now_ms < key.expires_at_ms, EKeyExpired);
    assert!(ctx.sender() == key.agent_address, ENotAgent);

    // Reset daily spending if new day
    maybe_reset_daily(vault, now_ms);

    // Check general policy rules
    policy::validate_spend(
        &vault.policy,
        amount,
        vault.today_spent,
        pool,
        now_ms,
    );

    // Check DeepBook price and pool rules
    policy::validate_deepbook_order(
        &vault.policy,
        pool,
        price,
    );

    // Check sufficient balance
    assert!(balance::value(&vault.balance) >= amount, EInsufficientBalance);

    // Update tracking
    vault.today_spent = vault.today_spent + amount;
    vault.total_spent = vault.total_spent + amount;

    // Increment agent reputation score on successful spend
    key.reputation_score = key.reputation_score + 1;

    // Withdraw funds
    let withdrawn = balance::split(&mut vault.balance, amount);
    let coin = coin::from_balance(withdrawn, ctx);

    // Emit success event (using the pool as the recipient)
    event::emit(SpendApproved {
        vault_id,
        agent_address: key.agent_address,
        amount,
        recipient: pool,
        remaining_balance: balance::value(&vault.balance),
        daily_spent: vault.today_spent,
    });

    // Log spend approved to audit
    let audit_entry = audit::log_spend_approved(
        vault_id,
        key.agent_address,
        amount,
        pool,
        now_ms,
        walrus_blob_id,
        ctx,
    );
    transfer::public_share_object(audit_entry);

    coin
}

/// Entry function wrapper for spend_for_deepbook_order
public fun spend_for_deepbook_order_to<T>(
    vault: &mut Vault<T>,
    key: &mut VaultKey,
    amount: u64,
    pool: address,
    price: u64,
    clock: &Clock,
    walrus_blob_id: String,
    ctx: &mut TxContext,
) {
    let coin = spend_for_deepbook_order(vault, key, amount, pool, price, clock, walrus_blob_id, ctx);
    transfer::public_transfer(coin, pool);
}

/// Entry function to log a blocked spend attempt on-chain.
/// Call this from client-side AI Risk Guardian to record blocked intents.
public fun log_blocked_spend<T>(
    vault: &Vault<T>,
    key: &VaultKey,
    amount: u64,
    target: address,
    clock: &Clock,
    reason: String,
    walrus_blob_id: String,
    ctx: &mut TxContext,
) {
    assert!(key.vault_id == object::id(vault), EKeyVaultMismatch);
    assert_active_key(vault, key);
    assert!(ctx.sender() == key.agent_address, ENotAgent);

    let audit_entry = audit::log_spend_blocked(
        object::id(vault),
        key.agent_address,
        amount,
        target,
        clock.timestamp_ms(),
        reason,
        walrus_blob_id,
        ctx,
    );
    transfer::public_share_object(audit_entry);
}

// ============================================================
// Public Functions — Owner Operations
// ============================================================

/// Owner deposits more funds into the vault
public fun deposit<T>(
    vault: &mut Vault<T>,
    _cap: &VaultOwnerCap,
    coin: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(_cap.vault_id == object::id(vault), ENotOwner);

    let amount = coin.value();
    let deposit_balance = coin::into_balance(coin);
    balance::join(&mut vault.balance, deposit_balance);

    event::emit(FundsDeposited {
        vault_id: object::id(vault),
        amount,
        new_balance: balance::value(&vault.balance),
        deposited_by: ctx.sender(),
    });

    let audit_entry = audit::log_funds_deposited(
        object::id(vault),
        ctx.sender(),
        amount,
        clock.timestamp_ms(),
        ctx,
    );
    transfer::public_share_object(audit_entry);
}

/// Owner withdraws funds from the vault
public fun withdraw<T>(
    vault: &mut Vault<T>,
    _cap: &VaultOwnerCap,
    amount: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(_cap.vault_id == object::id(vault), ENotOwner);
    assert!(balance::value(&vault.balance) >= amount, EInsufficientBalance);

    let withdrawn = balance::split(&mut vault.balance, amount);
    let coin = coin::from_balance(withdrawn, ctx);

    event::emit(FundsWithdrawn {
        vault_id: object::id(vault),
        amount,
        remaining_balance: balance::value(&vault.balance),
        withdrawn_by: ctx.sender(),
    });

    let audit_entry = audit::log_funds_withdrawn(
        object::id(vault),
        ctx.sender(),
        amount,
        clock.timestamp_ms(),
        ctx,
    );
    transfer::public_share_object(audit_entry);

    transfer::public_transfer(coin, ctx.sender());
}

/// Owner freezes the vault — kill switch. Agent cannot spend.
public fun freeze_vault<T>(
    vault: &mut Vault<T>,
    _cap: &VaultOwnerCap,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(_cap.vault_id == object::id(vault), ENotOwner);
    vault.is_frozen = true;

    event::emit(VaultFrozen {
        vault_id: object::id(vault),
        frozen_by: ctx.sender(),
    });

    let audit_entry = audit::log_vault_frozen(
        object::id(vault),
        ctx.sender(),
        clock.timestamp_ms(),
        ctx,
    );
    transfer::public_share_object(audit_entry);
}

/// Owner unfreezes the vault — re-enables agent spending
public fun unfreeze_vault<T>(
    vault: &mut Vault<T>,
    _cap: &VaultOwnerCap,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(_cap.vault_id == object::id(vault), ENotOwner);
    vault.is_frozen = false;

    event::emit(VaultUnfrozen {
        vault_id: object::id(vault),
        unfrozen_by: ctx.sender(),
    });

    let audit_entry = audit::log_vault_unfrozen(
        object::id(vault),
        ctx.sender(),
        clock.timestamp_ms(),
        ctx,
    );
    transfer::public_share_object(audit_entry);
}

/// Owner revokes the agent's VaultKey, destroying it
public fun revoke_key<T>(
    vault: &mut Vault<T>,
    _cap: &VaultOwnerCap,
    key: VaultKey,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(_cap.vault_id == object::id(vault), ENotOwner);
    assert!(vault.agent_key_id.is_some(), ENoActiveKey);

    let key_id = object::id(&key);
    assert!(*vault.agent_key_id.borrow() == key_id, EKeyVaultMismatch);

    // Clear the key reference in the vault
    vault.agent_key_id = option::none();

    // Destroy the key
    let VaultKey { id, vault_id: _, agent_address: _, expires_at_ms: _, agent_name: _, issued_at_ms: _, reputation_score: _ } = key;
    object::delete(id);

    event::emit(KeyRevoked {
        vault_id: object::id(vault),
        key_id,
        revoked_by: ctx.sender(),
    });

    let audit_entry = audit::log_key_revoked(
        object::id(vault),
        ctx.sender(),
        clock.timestamp_ms(),
        ctx,
    );
    transfer::public_share_object(audit_entry);
}

/// Owner deactivates the currently registered agent key without requiring custody
/// of the VaultKey object. This is the non-cooperative revocation path: any old
/// key object may still exist in an agent wallet, but spend paths will reject it
/// because it no longer matches vault.agent_key_id.
public fun deactivate_key<T>(
    vault: &mut Vault<T>,
    _cap: &VaultOwnerCap,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(_cap.vault_id == object::id(vault), ENotOwner);
    assert!(vault.agent_key_id.is_some(), ENoActiveKey);

    let key_id = *vault.agent_key_id.borrow();
    vault.agent_key_id = option::none();

    event::emit(KeyRevoked {
        vault_id: object::id(vault),
        key_id,
        revoked_by: ctx.sender(),
    });

    let audit_entry = audit::log_key_revoked(
        object::id(vault),
        ctx.sender(),
        clock.timestamp_ms(),
        ctx,
    );
    transfer::public_share_object(audit_entry);
}

/// Owner updates the vault's spending policy
public fun update_policy<T>(
    vault: &mut Vault<T>,
    _cap: &VaultOwnerCap,
    max_per_tx: u64,
    max_per_day: u64,
    allowed_recipients: vector<address>,
    active_hours_start: u8,
    active_hours_end: u8,
    is_deepbook_only: bool,
    deepbook_pool: address,
    max_price: u64,
    min_price: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(_cap.vault_id == object::id(vault), ENotOwner);

    vault.policy = policy::create_policy(
        max_per_tx,
        max_per_day,
        allowed_recipients,
        active_hours_start,
        active_hours_end,
        is_deepbook_only,
        deepbook_pool,
        max_price,
        min_price,
    );

    let audit_entry = audit::log_policy_updated(
        object::id(vault),
        ctx.sender(),
        clock.timestamp_ms(),
        ctx,
    );
    transfer::public_share_object(audit_entry);
}

/// Owner issues a new VaultKey to a (possibly different) agent.
/// Can only be called if there is no active key.
public fun issue_new_key<T>(
    vault: &mut Vault<T>,
    _cap: &VaultOwnerCap,
    agent_address: address,
    agent_name: String,
    key_duration_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
): VaultKey {
    assert!(_cap.vault_id == object::id(vault), ENotOwner);
    assert!(vault.agent_key_id.is_none(), EKeyAlreadyIssued);

    let now_ms = clock.timestamp_ms();
    let key_uid = object::new(ctx);
    let key_id = key_uid.to_inner();

    let key = VaultKey {
        id: key_uid,
        vault_id: object::id(vault),
        agent_address,
        expires_at_ms: now_ms + key_duration_ms,
        agent_name,
        issued_at_ms: now_ms,
        reputation_score: 0,
    };

    vault.agent_key_id = option::some(key_id);

    event::emit(KeyIssued {
        vault_id: object::id(vault),
        key_id,
        agent_address,
        agent_name: key.agent_name,
        expires_at_ms: key.expires_at_ms,
    });

    let audit_entry = audit::log_key_issued(
        object::id(vault),
        vault.owner,
        agent_address,
        now_ms,
        ctx,
    );
    transfer::public_share_object(audit_entry);

    key
}

/// Entry wrapper for issue_new_key — transfers key to agent
public fun issue_new_key_entry<T>(
    vault: &mut Vault<T>,
    _cap: &VaultOwnerCap,
    agent_address: address,
    agent_name: String,
    key_duration_ms: u64,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let key = issue_new_key(vault, _cap, agent_address, agent_name, key_duration_ms, clock, ctx);
    transfer::public_transfer(key, agent_address);
}

// ============================================================
// View Functions (Read-Only)
// ============================================================

/// Get the current balance of the vault
public fun vault_balance<T>(vault: &Vault<T>): u64 {
    balance::value(&vault.balance)
}

/// Check if the vault is frozen
public fun is_frozen<T>(vault: &Vault<T>): bool {
    vault.is_frozen
}

/// Get the vault owner address
public fun vault_owner<T>(vault: &Vault<T>): address {
    vault.owner
}

/// Get total lifetime spending
public fun total_spent<T>(vault: &Vault<T>): u64 {
    vault.total_spent
}

/// Get today's spending
public fun today_spent<T>(vault: &Vault<T>): u64 {
    vault.today_spent
}

/// Get the vault's policy
public fun vault_policy<T>(vault: &Vault<T>): &Policy {
    &vault.policy
}

/// Get the vault name
public fun vault_name<T>(vault: &Vault<T>): &String {
    &vault.name
}

/// Check if the vault has an active key
public fun has_active_key<T>(vault: &Vault<T>): bool {
    vault.agent_key_id.is_some()
}

/// Get VaultKey's vault_id
public fun key_vault_id(key: &VaultKey): ID {
    key.vault_id
}

/// Get VaultKey's agent address
public fun key_agent_address(key: &VaultKey): address {
    key.agent_address
}

/// Get VaultKey's expiry
public fun key_expires_at(key: &VaultKey): u64 {
    key.expires_at_ms
}

/// Check if a VaultKey is expired
public fun is_key_expired(key: &VaultKey, clock: &Clock): bool {
    clock.timestamp_ms() >= key.expires_at_ms
}

/// Get VaultKey's reputation score
public fun key_reputation_score(key: &VaultKey): u64 {
    key.reputation_score
}

/// Get VaultOwnerCap's vault_id
public fun cap_vault_id(cap: &VaultOwnerCap): ID {
    cap.vault_id
}

// ============================================================
// Internal Functions
// ============================================================

/// Ensures the provided key is the key currently registered on the vault.
fun assert_active_key<T>(vault: &Vault<T>, key: &VaultKey) {
    assert!(vault.agent_key_id.is_some(), ENoActiveKey);
    assert!(*vault.agent_key_id.borrow() == object::id(key), EInactiveKey);
}

/// Reset daily spending counter if a new day has started
fun maybe_reset_daily<T>(vault: &mut Vault<T>, now_ms: u64) {
    if (now_ms - vault.last_reset_ms >= MS_PER_DAY) {
        vault.today_spent = 0;
        vault.last_reset_ms = now_ms;
    };
}
