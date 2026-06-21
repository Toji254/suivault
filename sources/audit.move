/// SuiVault — Audit Module
///
/// Provides on-chain audit logging for all vault actions.
/// Every spend attempt (approved or blocked) creates an immutable AuditEntry.
/// These entries serve as a verifiable, tamper-proof record of all agent activity.
///
/// For detailed execution context (agent reasoning, full request data),
/// the off-chain SDK stores extended logs on Walrus and references
/// the blob ID in the AuditEntry.
module suivault::audit;

use sui::event;
use std::string::String;

// ============================================================
// Audit Entry Object
// ============================================================

/// An immutable, on-chain record of an agent action.
/// Created for every spend attempt — whether approved or blocked.
/// Once created, cannot be modified or deleted.
public struct AuditEntry has key, store {
    id: UID,
    /// ID of the vault involved
    vault_id: ID,
    /// Address of the agent that attempted the action
    agent_address: address,
    /// Type of action: "spend_approved", "spend_blocked", "vault_frozen", etc.
    action_type: String,
    /// Amount involved in the action (0 for non-financial actions)
    amount: u64,
    /// Target recipient address (if applicable)
    target: address,
    /// Timestamp (ms) when this action occurred
    timestamp_ms: u64,
    /// Whether the action was successful
    success: bool,
    /// Reason for blocking (empty if approved)
    block_reason: String,
    /// Optional Walrus blob ID for extended off-chain logs
    walrus_blob_id: String,
}

// ============================================================
// Events
// ============================================================

/// Emitted for every audit entry created — enables off-chain indexing
public struct AuditEntryCreated has copy, drop {
    audit_id: ID,
    vault_id: ID,
    agent_address: address,
    action_type: String,
    amount: u64,
    success: bool,
    timestamp_ms: u64,
}

// ============================================================
// Audit Entry Creation
// ============================================================

/// Create an audit entry for an approved spend
public fun log_spend_approved(
    vault_id: ID,
    agent_address: address,
    amount: u64,
    target: address,
    timestamp_ms: u64,
    walrus_blob_id: String,
    ctx: &mut TxContext,
): AuditEntry {
    let entry = create_entry(
        vault_id,
        agent_address,
        std::string::utf8(b"spend_approved"),
        amount,
        target,
        timestamp_ms,
        true,
        std::string::utf8(b""),
        walrus_blob_id,
        ctx,
    );

    entry
}

/// Create an audit entry for a blocked spend
public fun log_spend_blocked(
    vault_id: ID,
    agent_address: address,
    amount: u64,
    target: address,
    timestamp_ms: u64,
    reason: String,
    walrus_blob_id: String,
    ctx: &mut TxContext,
): AuditEntry {
    let entry = create_entry(
        vault_id,
        agent_address,
        std::string::utf8(b"spend_blocked"),
        amount,
        target,
        timestamp_ms,
        false,
        reason,
        walrus_blob_id,
        ctx,
    );

    entry
}

/// Create an audit entry for vault freeze
public fun log_vault_frozen(
    vault_id: ID,
    frozen_by: address,
    timestamp_ms: u64,
    ctx: &mut TxContext,
): AuditEntry {
    let entry = create_entry(
        vault_id,
        frozen_by,
        std::string::utf8(b"vault_frozen"),
        0,
        @0x0,
        timestamp_ms,
        true,
        std::string::utf8(b""),
        std::string::utf8(b""),
        ctx,
    );

    entry
}

/// Create an audit entry for vault unfreeze
public fun log_vault_unfrozen(
    vault_id: ID,
    unfrozen_by: address,
    timestamp_ms: u64,
    ctx: &mut TxContext,
): AuditEntry {
    let entry = create_entry(
        vault_id,
        unfrozen_by,
        std::string::utf8(b"vault_unfrozen"),
        0,
        @0x0,
        timestamp_ms,
        true,
        std::string::utf8(b""),
        std::string::utf8(b""),
        ctx,
    );

    entry
}

/// Create an audit entry for key issuance
public fun log_key_issued(
    vault_id: ID,
    owner: address,
    agent_address: address,
    timestamp_ms: u64,
    ctx: &mut TxContext,
): AuditEntry {
    let entry = create_entry(
        vault_id,
        owner,
        std::string::utf8(b"key_issued"),
        0,
        agent_address,
        timestamp_ms,
        true,
        std::string::utf8(b""),
        std::string::utf8(b""),
        ctx,
    );

    entry
}

/// Create an audit entry for key revocation
public fun log_key_revoked(
    vault_id: ID,
    owner: address,
    timestamp_ms: u64,
    ctx: &mut TxContext,
): AuditEntry {
    let entry = create_entry(
        vault_id,
        owner,
        std::string::utf8(b"key_revoked"),
        0,
        @0x0,
        timestamp_ms,
        true,
        std::string::utf8(b""),
        std::string::utf8(b""),
        ctx,
    );

    entry
}

/// Create an audit entry for owner deposit
public fun log_funds_deposited(
    vault_id: ID,
    deposited_by: address,
    amount: u64,
    timestamp_ms: u64,
    ctx: &mut TxContext,
): AuditEntry {
    create_entry(
        vault_id,
        deposited_by,
        std::string::utf8(b"funds_deposited"),
        amount,
        @0x0,
        timestamp_ms,
        true,
        std::string::utf8(b""),
        std::string::utf8(b""),
        ctx,
    )
}

/// Create an audit entry for owner withdrawal
public fun log_funds_withdrawn(
    vault_id: ID,
    withdrawn_by: address,
    amount: u64,
    timestamp_ms: u64,
    ctx: &mut TxContext,
): AuditEntry {
    create_entry(
        vault_id,
        withdrawn_by,
        std::string::utf8(b"funds_withdrawn"),
        amount,
        withdrawn_by,
        timestamp_ms,
        true,
        std::string::utf8(b""),
        std::string::utf8(b""),
        ctx,
    )
}

/// Create an audit entry for owner policy updates
public fun log_policy_updated(
    vault_id: ID,
    updated_by: address,
    timestamp_ms: u64,
    ctx: &mut TxContext,
): AuditEntry {
    create_entry(
        vault_id,
        updated_by,
        std::string::utf8(b"policy_updated"),
        0,
        @0x0,
        timestamp_ms,
        true,
        std::string::utf8(b""),
        std::string::utf8(b""),
        ctx,
    )
}

// ============================================================
// Walrus Integration
// ============================================================

/// Attach a Walrus blob ID to an existing audit entry.
/// This links the on-chain record to detailed off-chain logs stored on Walrus.
/// Can only be called by the agent that originally triggered this audit entry.
public fun attach_walrus_blob(
    entry: &mut AuditEntry,
    blob_id: String,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == entry.agent_address, 7); // ENotAgent
    entry.walrus_blob_id = blob_id;
}

// ============================================================
// View Functions
// ============================================================

/// Get the vault ID from an audit entry
public fun entry_vault_id(entry: &AuditEntry): ID {
    entry.vault_id
}

/// Get the agent address from an audit entry
public fun entry_agent_address(entry: &AuditEntry): address {
    entry.agent_address
}

/// Get the action type from an audit entry
public fun entry_action_type(entry: &AuditEntry): &String {
    &entry.action_type
}

/// Get the amount from an audit entry
public fun entry_amount(entry: &AuditEntry): u64 {
    entry.amount
}

/// Get the target address from an audit entry
public fun entry_target(entry: &AuditEntry): address {
    entry.target
}

/// Get the timestamp from an audit entry
public fun entry_timestamp(entry: &AuditEntry): u64 {
    entry.timestamp_ms
}

/// Check if the action was successful
public fun entry_success(entry: &AuditEntry): bool {
    entry.success
}

/// Get the block reason (empty string if approved)
public fun entry_block_reason(entry: &AuditEntry): &String {
    &entry.block_reason
}

/// Get the Walrus blob ID (empty string if not attached)
public fun entry_walrus_blob_id(entry: &AuditEntry): &String {
    &entry.walrus_blob_id
}

// ============================================================
// Internal Functions
// ============================================================

/// Internal function to create an audit entry and emit the event
fun create_entry(
    vault_id: ID,
    agent_address: address,
    action_type: String,
    amount: u64,
    target: address,
    timestamp_ms: u64,
    success: bool,
    block_reason: String,
    walrus_blob_id: String,
    ctx: &mut TxContext,
): AuditEntry {
    let uid = object::new(ctx);
    let audit_id = uid.to_inner();

    event::emit(AuditEntryCreated {
        audit_id,
        vault_id,
        agent_address,
        action_type,
        amount,
        success,
        timestamp_ms,
    });

    AuditEntry {
        id: uid,
        vault_id,
        agent_address,
        action_type,
        amount,
        target,
        timestamp_ms,
        success,
        block_reason,
        walrus_blob_id,
    }
}
