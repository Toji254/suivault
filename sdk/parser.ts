import type { Vault, VaultKey, VaultOwnerCap, AuditEntry, Policy, AuditActionType } from "./types";

/**
 * Extracts fields from a raw Sui object response or fields object directly.
 */
function getFields(raw: any): any {
  if (!raw) return null;
  if (raw.data?.content?.fields) {
    return raw.data.content.fields;
  }
  if (raw.content?.fields) {
    return raw.content.fields;
  }
  if (raw.fields) {
    return raw.fields;
  }
  return raw;
}

/**
 * Extracts the object ID from a raw Sui object response or fields object.
 */
function getId(raw: any): string {
  if (!raw) return "";
  if (raw.data?.objectId) return raw.data.objectId;
  if (raw.objectId) return raw.objectId;
  const fields = getFields(raw);
  if (fields?.id?.id) return fields.id.id;
  if (fields?.id) return typeof fields.id === "string" ? fields.id : fields.id.id;
  return "";
}

/**
 * Parses an Option ID representation from Sui Move struct fields.
 * Option<ID> is represented as { fields: { vec: [id] } } or similar vector structure.
 */
function parseOptionId(optionField: any): string | null {
  if (!optionField) return null;
  const vec = optionField.fields?.vec || optionField.vec;
  if (Array.isArray(vec) && vec.length > 0) {
    return vec[0];
  }
  return null;
}

/**
 * Parses a raw object response into a Vault interface.
 */
export function parseVault(raw: any): Vault {
  const fields = getFields(raw);
  const id = getId(raw);

  if (!fields) {
    throw new Error("Invalid Vault object: fields not found");
  }

  const rawPolicy = fields.policy?.fields || fields.policy;
  if (!rawPolicy) {
    throw new Error("Invalid Vault object: policy not found");
  }

  const policy: Policy = {
    maxPerTx: BigInt(rawPolicy.max_per_tx || 0),
    maxPerDay: BigInt(rawPolicy.max_per_day || 0),
    allowedRecipients: Array.isArray(rawPolicy.allowed_recipients)
      ? rawPolicy.allowed_recipients
      : [],
    activeHoursStart: Number(rawPolicy.active_hours_start || 0),
    activeHoursEnd: Number(rawPolicy.active_hours_end || 0),
    isDeepbookOnly: Boolean(rawPolicy.is_deepbook_only),
    deepbookPool: rawPolicy.deepbook_pool || "",
    maxPrice: BigInt(rawPolicy.max_price || 0),
    minPrice: BigInt(rawPolicy.min_price || 0),
  };

  return {
    id,
    owner: fields.owner || "",
    balance: BigInt(fields.balance || 0),
    policy,
    agentKeyId: parseOptionId(fields.agent_key_id),
    name: fields.name || "",
    totalSpent: BigInt(fields.total_spent || 0),
    todaySpent: BigInt(fields.today_spent || 0),
    lastResetMs: Number(fields.last_reset_ms || 0),
    createdAtMs: Number(fields.created_at_ms || 0),
    isFrozen: Boolean(fields.is_frozen),
  };
}

/**
 * Parses a raw object response into a VaultKey interface.
 */
export function parseVaultKey(raw: any): VaultKey {
  const fields = getFields(raw);
  const id = getId(raw);

  if (!fields) {
    throw new Error("Invalid VaultKey object: fields not found");
  }

  return {
    id,
    vaultId: fields.vault_id || "",
    agentAddress: fields.agent_address || "",
    expiresAtMs: Number(fields.expires_at_ms || 0),
    agentName: fields.agent_name || "",
    issuedAtMs: Number(fields.issued_at_ms || 0),
    reputationScore: Number(fields.reputation_score || 0),
  };
}

/**
 * Parses a raw object response into a VaultOwnerCap interface.
 */
export function parseVaultOwnerCap(raw: any): VaultOwnerCap {
  const fields = getFields(raw);
  const id = getId(raw);

  if (!fields) {
    throw new Error("Invalid VaultOwnerCap object: fields not found");
  }

  return {
    id,
    vaultId: fields.vault_id || "",
  };
}

/**
 * Parses a raw object response or event into an AuditEntry interface.
 */
export function parseAuditEntry(raw: any): AuditEntry {
  const fields = getFields(raw);
  const id = getId(raw);

  if (!fields) {
    throw new Error("Invalid AuditEntry object: fields not found");
  }

  return {
    id,
    vaultId: fields.vault_id || "",
    agentAddress: fields.agent_address || "",
    actionType: (fields.action_type || "") as AuditActionType,
    amount: BigInt(fields.amount || 0),
    target: fields.target || "",
    timestampMs: Number(fields.timestamp_ms || 0),
    success: Boolean(fields.success),
    blockReason: fields.block_reason || "",
    walrusBlobId: fields.walrus_blob_id || "",
  };
}
