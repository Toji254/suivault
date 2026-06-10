"use client";

import { useEffect, useState } from "react";
import { useSuiClient } from "@mysten/dapp-kit";
import { useSearchParams } from "next/navigation";
import { Cpu, Key, ArrowUpRight, CheckCircle2, XCircle, AlertTriangle, Plus, Trash2, Search, Wallet, Upload } from "lucide-react";
import { vaultClient } from "../../lib/suivault";
import { parseVaultError, mistToSui, suiToMist } from "../../../sdk/client";
import type { Vault, VaultKey } from "../../../sdk/types";
import { useUnifiedExecutor } from "../../hooks/useUnifiedExecutor";
import { AiRiskGuardian } from "../../../sdk/guardian";

interface ResolvedKey {
  key: VaultKey;
  vault: Vault | null;
  source: "wallet" | "imported-address" | "imported-key";
  ownerAddress?: string;
}

interface AgentStrategy {
  slug: string;
  title: string;
  category: string;
  defaultAmountSui: string;
  description: string;
  executionNote: string;
}

const FALLBACK_RECIPIENT = "0xdeeb000000000000000000000000000000000000000000000000000000000000";

const AGENT_STRATEGIES: AgentStrategy[] = [
  {
    slug: "arbitrage",
    title: "Arbitrage Swarm",
    category: "DeFi Execution",
    defaultAmountSui: "0.02",
    description: "Runs a small policy-checked spend to the vault's first whitelisted DeFi target.",
    executionNote: "Uses the first whitelisted recipient when available, so the transaction should pass unless another policy limit blocks it.",
  },
  {
    slug: "meme",
    title: "Meme Accumulator",
    category: "Token Trading",
    defaultAmountSui: "0.04",
    description: "Tests a higher-volatility accumulation spend against transaction and daily limits.",
    executionNote: "Uses the vault whitelist when present and a moderate amount so overspending rules can still protect the vault.",
  },
  {
    slug: "sentiment",
    title: "Sentiment Tracker",
    category: "Social Intelligence",
    defaultAmountSui: "0.01",
    description: "Submits a low-value signal-driven spend intent through the AI Risk Guardian.",
    executionNote: "Keeps amount intentionally small; this is useful for verifying whitelists and audit logging.",
  },
  {
    slug: "liquidation",
    title: "Liquidation Bot",
    category: "Risk Management",
    defaultAmountSui: "0.03",
    description: "Executes a conservative liquidation-response spend while respecting freeze and expiry checks.",
    executionNote: "If the selected vault is frozen or the key is expired, the UI prevents execution before signing.",
  },
];

function getStrategy(slug?: string | null) {
  return AGENT_STRATEGIES.find((strategy) => strategy.slug === slug) || null;
}

function recipientForStrategy(strategy: AgentStrategy, item: ResolvedKey) {
  const policy = item.vault?.policy;
  if (policy?.allowedRecipients?.length) {
    return policy.allowedRecipients[0];
  }
  if (strategy.slug === "liquidation" && policy?.isDeepbookOnly && policy.deepbookPool) {
    return policy.deepbookPool;
  }
  return FALLBACK_RECIPIENT;
}

export default function AgentView() {
  const searchParams = useSearchParams();
  const { executeTransaction, isConnected, activeAddress, isMock } = useUnifiedExecutor();
  const suiClient = useSuiClient();
  const requestedStrategy = getStrategy(searchParams.get("strategy"));

  const [resolvedKeys, setResolvedKeys] = useState<ResolvedKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSpendKey, setActiveSpendKey] = useState<ResolvedKey | null>(null);
  const [selectedStrategySlug, setSelectedStrategySlug] = useState(requestedStrategy?.slug || AGENT_STRATEGIES[0].slug);

  // Import Agent states
  const [importedAddresses, setImportedAddresses] = useState<string[]>([]);
  const [importedKeyIds, setImportedKeyIds] = useState<string[]>([]);
  const [importType, setImportType] = useState<"address" | "key">("address");
  const [importInput, setImportInput] = useState("");
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState("");

  // Spend form states
  const [recipient, setRecipient] = useState("");
  const [amountSui, setAmountSui] = useState("");
  const [spendLoading, setSpendLoading] = useState(false);
  const [spendError, setSpendError] = useState("");
  const [spendSuccess, setSpendSuccess] = useState("");
  const selectedStrategy = getStrategy(selectedStrategySlug) || AGENT_STRATEGIES[0];

  // Load imported addresses and keys from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedAddrs = localStorage.getItem("suivault_tracked_agent_addresses");
      const savedKeys = localStorage.getItem("suivault_tracked_key_ids");
      if (savedAddrs) {
        try {
          setImportedAddresses(JSON.parse(savedAddrs));
        } catch (e) {
          console.error(e);
        }
      }
      if (savedKeys) {
        try {
          setImportedKeyIds(JSON.parse(savedKeys));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  const loadAgentKeys = async () => {
    setLoading(true);
    try {
      const keysMap = new Map<string, ResolvedKey>();

      // 1. Load keys owned by connected wallet
      if (activeAddress) {
        if (isMock) {
          // Add a mock key in demo mode
          const mockKey: VaultKey = {
            id: "0xmock_key_id_99281a",
            vaultId: "0xmock_vault_id_1192fa",
            agentAddress: activeAddress,
            agentName: "Mock Trading Bot",
            expiresAtMs: Date.now() + 86400000 * 7,
            issuedAtMs: Date.now(),
            reputationScore: 0,
          };
          keysMap.set(mockKey.id, { key: mockKey, vault: null, source: "wallet" });
        } else {
          const primaryKeys = await vaultClient.getAgentKeys(activeAddress);
          for (const k of primaryKeys) {
            keysMap.set(k.id, { key: k, vault: null, source: "wallet" });
          }
        }
      }

      // 2. Load keys owned by imported addresses
      for (const addr of importedAddresses) {
        const addrKeys = await vaultClient.getAgentKeys(addr);
        for (const k of addrKeys) {
          keysMap.set(k.id, { key: k, vault: null, source: "imported-address", ownerAddress: addr });
        }
      }

      // 3. Load keys by imported Key IDs
      for (const keyId of importedKeyIds) {
        if (!keysMap.has(keyId)) {
          try {
            const k = await vaultClient.getVaultKey(keyId);
            if (k) {
              keysMap.set(k.id, { key: k, vault: null, source: "imported-key" });
            }
          } catch (e) {
            console.error(`Failed to load key ID ${keyId}:`, e);
          }
        }
      }

      const keysList = Array.from(keysMap.values());

      // 4. Resolve Vault structures
      const resolved: ResolvedKey[] = [];
      for (const item of keysList) {
        try {
          if (isMock && item.key.id.startsWith("0xmock")) {
            const mockVault: Vault = {
              id: "0xmock_vault_id_1192fa",
              name: "Mock Trading Vault",
              owner: activeAddress || "0xmock_owner",
              balance: 100_000_000_000n, // 100 SUI
              totalSpent: 0n,
              todaySpent: 0n,
              lastResetMs: Date.now(),
              createdAtMs: Date.now(),
              isFrozen: false,
              agentKeyId: "0xmock_key_id_99281a",
              policy: {
                maxPerTx: 10_000_000_000n, // 10 SUI
                maxPerDay: 50_000_000_000n, // 50 SUI
                allowedRecipients: [],
                activeHoursStart: 0,
                activeHoursEnd: 0,
                isDeepbookOnly: false,
                deepbookPool: "0x0000000000000000000000000000000000000000000000000000000000000000",
                maxPrice: 0n,
                minPrice: 0n,
              }
            };
            resolved.push({ ...item, vault: mockVault });
          } else {
            const v = await vaultClient.getVault(item.key.vaultId);
            resolved.push({ ...item, vault: v });
          }
        } catch (e) {
          resolved.push(item);
        }
      }
      setResolvedKeys(resolved);
    } catch (e) {
      console.error("Failed to load agent keys:", e);
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when dependencies change
  useEffect(() => {
    loadAgentKeys();
  }, [activeAddress, importedAddresses, importedKeyIds]);

  useEffect(() => {
    if (requestedStrategy) {
      setSelectedStrategySlug(requestedStrategy.slug);
    }
  }, [requestedStrategy?.slug]);

  useEffect(() => {
    if (!activeSpendKey || !selectedStrategy) return;
    setRecipient(recipientForStrategy(selectedStrategy, activeSpendKey));
    setAmountSui(selectedStrategy.defaultAmountSui);
  }, [activeSpendKey, selectedStrategySlug]);

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportError("");
    setImportSuccess("");
    const val = importInput.trim();
    if (!val) return;

    if (!val.startsWith("0x") || val.length < 10) {
      setImportError("Invalid object ID/address format (must start with 0x)");
      return;
    }

    if (importType === "address") {
      if (importedAddresses.includes(val)) {
        setImportError("This agent address is already imported");
        return;
      }
      const updated = [...importedAddresses, val];
      setImportedAddresses(updated);
      localStorage.setItem("suivault_tracked_agent_addresses", JSON.stringify(updated));
      setImportInput("");
      setImportSuccess("Agent address successfully added!");
    } else {
      if (importedKeyIds.includes(val)) {
        setImportError("This VaultKey ID is already imported");
        return;
      }
      setLoading(true);
      try {
        const key = await vaultClient.getVaultKey(val);
        if (!key) {
          setImportError("VaultKey object not found on-chain. Check ID & network.");
          setLoading(false);
          return;
        }
        const updated = [...importedKeyIds, val];
        setImportedKeyIds(updated);
        localStorage.setItem("suivault_tracked_key_ids", JSON.stringify(updated));
        setImportInput("");
        setImportSuccess("VaultKey object successfully added!");
      } catch (err: any) {
        setImportError(err.message || "Failed to query VaultKey object");
        setLoading(false);
      }
    }
  };

  const handleRemoveAddress = (addr: string) => {
    const updated = importedAddresses.filter((a) => a !== addr);
    setImportedAddresses(updated);
    localStorage.setItem("suivault_tracked_agent_addresses", JSON.stringify(updated));
    if (activeSpendKey && activeSpendKey.ownerAddress === addr) {
      setActiveSpendKey(null);
    }
  };

  const handleRemoveKeyId = (id: string) => {
    const updated = importedKeyIds.filter((k) => k !== id);
    setImportedKeyIds(updated);
    localStorage.setItem("suivault_tracked_key_ids", JSON.stringify(updated));
    if (activeSpendKey && activeSpendKey.key.id === id) {
      setActiveSpendKey(null);
    }
  };

  const handleManifestUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setImportError("");
    setImportSuccess("");
    if (!file) return;

    try {
      const manifest = JSON.parse(await file.text());
      const agentAddress = String(
        manifest.agentAddress ||
        manifest.agent_address ||
        manifest.address ||
        manifest.walletAddress ||
        ""
      ).trim();
      const keyId = String(
        manifest.vaultKeyId ||
        manifest.vault_key_id ||
        manifest.keyId ||
        manifest.key_id ||
        ""
      ).trim();

      if ((!agentAddress || !agentAddress.startsWith("0x")) && (!keyId || !keyId.startsWith("0x"))) {
        setImportError("Manifest must include agentAddress/address or vaultKeyId/keyId beginning with 0x.");
        return;
      }

      let nextAddresses = importedAddresses;
      let nextKeyIds = importedKeyIds;
      const added: string[] = [];

      if (agentAddress && agentAddress.startsWith("0x") && !importedAddresses.includes(agentAddress)) {
        nextAddresses = [...nextAddresses, agentAddress];
        added.push("agent address");
      }

      if (keyId && keyId.startsWith("0x") && !importedKeyIds.includes(keyId)) {
        setLoading(true);
        const key = await vaultClient.getVaultKey(keyId);
        setLoading(false);
        if (!key) {
          setImportError("Manifest VaultKey ID was not found on-chain. The address was not imported.");
          return;
        }
        nextKeyIds = [...nextKeyIds, keyId];
        added.push("VaultKey");
      }

      setImportedAddresses(nextAddresses);
      setImportedKeyIds(nextKeyIds);
      localStorage.setItem("suivault_tracked_agent_addresses", JSON.stringify(nextAddresses));
      localStorage.setItem("suivault_tracked_key_ids", JSON.stringify(nextKeyIds));
      setImportSuccess(added.length ? `Imported ${added.join(" and ")} from manifest.` : "Manifest entries were already tracked.");
    } catch (err: any) {
      setLoading(false);
      setImportError(err.message || "Could not read agent manifest JSON.");
    }
  };

  const handleSpend = async () => {
    if (!activeSpendKey || !recipient || !amountSui) return;
    setSpendLoading(true);
    setSpendError("");
    setSpendSuccess("");

    try {
      if (!recipient.startsWith("0x") || recipient.length < 10) {
        throw new Error("Recipient must be a valid Sui address beginning with 0x.");
      }
      if (!Number.isFinite(Number(amountSui)) || Number(amountSui) <= 0) {
        throw new Error("Spend amount must be greater than 0 SUI.");
      }

      const amountMist = suiToMist(Number(amountSui));
      const guardian = new AiRiskGuardian();
      
      let currentVault = activeSpendKey.vault;
      if (!currentVault && activeSpendKey.key.vaultId) {
        try {
          currentVault = await vaultClient.getVault(activeSpendKey.key.vaultId);
        } catch (e) {
          console.error("Failed to load vault for guardian check:", e);
        }
      }

      const evaluationVault = currentVault || {
        id: activeSpendKey.key.vaultId,
        name: "Dynamic Vault",
        owner: "",
        balance: 1000000000000n,
        todaySpent: 0n,
        totalSpent: 0n,
        agentKeyId: activeSpendKey.key.id,
        isFrozen: false,
        createdAtMs: Date.now(),
        lastResetMs: Date.now(),
        policy: {
          maxPerTx: 10000000000n,
          maxPerDay: 50000000000n,
          allowedRecipients: [],
          activeHoursStart: 0,
          activeHoursEnd: 0,
          isDeepbookOnly: false,
          deepbookPool: "0x0000000000000000000000000000000000000000000000000000000000000000",
          maxPrice: 0n,
          minPrice: 0n,
        }
      };

      const verdict = await guardian.evaluateSpend(
        evaluationVault,
        activeSpendKey.key,
        amountMist,
        recipient
      );

      let tx;

      if (!verdict.allowed) {
        if (!isMock) {
          try {
            tx = vaultClient.buildLogBlockedSpend(
              activeSpendKey.key.vaultId,
              activeSpendKey.key.id,
              amountMist,
              recipient,
              verdict.reason || "AI Risk Guardian blocked",
              verdict.walrusBlobId
            );
            await executeTransaction(tx as any, { description: "Log Blocked Spend On-Chain" });
          } catch (e: any) {
            console.error("Failed to log blocked spend on-chain:", e);
          }
        } else {
          await executeTransaction(null as any, { description: "Log Blocked Spend (AI Guardian)" });
        }

        setSpendLoading(false);
        setSpendError(
          `AI Risk Guardian Blocked Spending: ${verdict.reason}. Blocked spend logged. Walrus Log ID: ${verdict.walrusBlobId}`
        );
        return;
      }

      if (!isMock) {
        const check = await vaultClient.checkSpendWouldSucceed(
          activeSpendKey.key.vaultId,
          amountMist,
          recipient
        );

        if (!check.ok) {
          setSpendLoading(false);
          setSpendError(`Pre-flight warning: ${check.reason}`);
          return;
        }

        tx = vaultClient.buildSpend(
          activeSpendKey.key.vaultId,
          activeSpendKey.key.id,
          amountMist,
          recipient,
          verdict.walrusBlobId
        );
      } else {
        const { Transaction } = await import("@mysten/sui/transactions");
        tx = new Transaction();
      }

      const res = await executeTransaction(tx as any, { description: "Agent Spend Transaction" });
      
      setSpendLoading(false);
      setSpendSuccess(`Spend transaction approved! Digest: ${res.digest}. Walrus Log ID: ${verdict.walrusBlobId}`);
      setRecipient("");
      setAmountSui("");
      loadAgentKeys();
    } catch (e: any) {
      setSpendLoading(false);
      setSpendError(e.message || "Failed to construct spend transaction");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "10px" }}>
            <Cpu size={28} color="var(--color-primary)" />
            Agent Key Console
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.95rem" }}>
            {isConnected ? (
              <>
                Active keys issued to current address:{" "}
                <span className="font-mono" style={{ color: "var(--color-primary)" }}>
                  {activeAddress?.substring(0, 10)}...{activeAddress?.substring(activeAddress.length - 6)}
                </span>
              </>
            ) : (
              "Connect a wallet or import agent details below to monitor spending limits and track policies."
            )}
          </p>
        </div>
      </div>

      <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ color: "#fff", fontSize: "1.1rem", fontWeight: 600, margin: "0 0 6px", display: "flex", alignItems: "center", gap: "8px" }}>
              <Cpu size={18} color="var(--color-primary)" />
              {selectedStrategy.title}
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.86rem", margin: 0, maxWidth: "720px", lineHeight: 1.6 }}>
              {selectedStrategy.description}
            </p>
          </div>
          <span className="badge" style={{ whiteSpace: "nowrap", background: "rgba(30, 106, 255, 0.12)", color: "var(--color-primary)", border: "1px solid rgba(30, 106, 255, 0.3)" }}>
            {selectedStrategy.category}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "10px" }}>
          {AGENT_STRATEGIES.map((strategy) => {
            const active = strategy.slug === selectedStrategy.slug;
            return (
              <button
                key={strategy.slug}
                type="button"
                onClick={() => setSelectedStrategySlug(strategy.slug)}
                style={{
                  minHeight: "58px",
                  borderRadius: "8px",
                  border: active ? "1px solid rgba(30, 106, 255, 0.55)" : "1px solid var(--border-light)",
                  background: active ? "rgba(30, 106, 255, 0.12)" : "rgba(255,255,255,0.025)",
                  color: active ? "#fff" : "var(--text-secondary)",
                  cursor: "pointer",
                  textAlign: "left",
                  padding: "10px 12px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  transition: "all 0.2s ease",
                }}
              >
                <span style={{ display: "block", fontSize: "0.9rem", fontWeight: 600 }}>{strategy.title}</span>
                <span style={{ display: "block", fontSize: "0.72rem", color: active ? "#a3c4ff" : "var(--text-muted)", marginTop: "3px" }}>
                  {strategy.defaultAmountSui} SUI intent
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr", gap: "24px", alignItems: "start" }}>
        
        {/* LEFT COLUMN: Agent Key List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, color: "#fff", borderBottom: "1px solid var(--border-light)", paddingBottom: "10px", margin: 0 }}>
            Delegated Agent Spending Keys ({resolvedKeys.length})
          </h2>

          {loading && resolvedKeys.length === 0 ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
              <div className="spinner"></div>
            </div>
          ) : resolvedKeys.length === 0 ? (
            <div className="glass-panel" style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "60px 40px",
              textAlign: "center",
              gap: "16px",
              border: "1px dashed var(--border-light)",
            }}>
              <Key size={32} color="var(--text-muted)" />
              <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>No Agent Keys Found</h3>
              <p style={{ color: "var(--text-secondary)", maxWidth: "420px", fontSize: "0.85rem" }}>
                There are no active spending keys linked to your connected wallet or imported profiles. Import an agent address or key ID on the right to start tracking.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {resolvedKeys.map((item) => {
                const isKeyExpired = item.key.expiresAtMs < Date.now();
                const isVaultFrozen = item.vault?.isFrozen ?? false;
                
                return (
                  <div key={item.key.id} className="glass-panel" style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    border: activeSpendKey?.key.id === item.key.id ? "1px solid var(--border-glow)" : "1px solid var(--border-light)",
                    boxShadow: activeSpendKey?.key.id === item.key.id ? "0 0 20px var(--color-primary-glow)" : "var(--glass-shadow)",
                  }}>
                    
                    {/* Card Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <h3 style={{ fontSize: "1.15rem", fontWeight: 600, color: "#fff" }}>
                            {item.vault?.name || "Unknown Vault"}
                          </h3>
                          <span style={{
                            fontSize: "0.7rem",
                            padding: "2px 6px",
                            borderRadius: "4px",
                            background: item.source === "wallet" ? "rgba(30, 106, 255, 0.15)" : "rgba(163, 179, 204, 0.1)",
                            color: item.source === "wallet" ? "var(--color-primary)" : "var(--text-secondary)",
                            border: item.source === "wallet" ? "1px solid rgba(30, 106, 255, 0.3)" : "1px solid rgba(163, 179, 204, 0.2)",
                          }}>
                            {item.source === "wallet" ? "Connected Wallet" : "Imported Agent"}
                          </span>
                        </div>
                        <span className="font-mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block", marginTop: "4px" }}>
                          Key Object: {item.key.id}
                        </span>
                        <span className="font-mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          Agent Address: {item.key.agentAddress}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "6px" }}>
                        {isVaultFrozen && <span className="badge badge-danger">Frozen</span>}
                        {isKeyExpired && <span className="badge badge-danger">Expired</span>}
                        {!isVaultFrozen && !isKeyExpired && <span className="badge badge-success">Valid</span>}
                      </div>
                    </div>

                    {/* Policy rules summary */}
                    {item.vault && (
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr 1.2fr",
                        gap: "12px",
                        background: "rgba(0,0,0,0.15)",
                        padding: "12px",
                        borderRadius: "10px",
                        fontSize: "0.85rem",
                        border: "1px solid var(--border-light)",
                      }}>
                        <div>
                          <span style={{ color: "var(--text-secondary)", display: "block" }}>Per Transaction</span>
                          <span style={{ color: "#fff", fontWeight: 500 }}>
                            {mistToSui(item.vault.policy.maxPerTx)} SUI
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-secondary)", display: "block" }}>Daily Limit</span>
                          <span style={{ color: "#fff", fontWeight: 500 }}>
                            {mistToSui(item.vault.policy.maxPerDay)} SUI
                          </span>
                        </div>
                        <div>
                          <span style={{ color: "var(--text-secondary)", display: "block" }}>Target Limits</span>
                          <span style={{ color: "#fff", fontWeight: 500 }}>
                            {item.vault.policy.isDeepbookOnly ? "DeepBook SUI/USDC Only" : `${item.vault.policy.allowedRecipients.length} Whitelist Addresses`}
                          </span>
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                        Expires: {new Date(item.key.expiresAtMs).toLocaleDateString()} at {new Date(item.key.expiresAtMs).toLocaleTimeString()}
                      </span>

                      <button 
                        className="btn btn-secondary" 
                        onClick={() => {
                          setActiveSpendKey(item);
                          setSpendError("");
                          setSpendSuccess("");
                        }}
                        disabled={isVaultFrozen || isKeyExpired}
                        style={{ fontSize: "0.85rem", padding: "8px 16px" }}
                      >
                        <ArrowUpRight size={14} />
                        Simulate Spend
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Import & Simulation Widgets */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* WIDGET 1: Import Agent */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Plus size={18} color="var(--color-primary)" />
              Import Custom Agent
            </h3>
            
            <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: 0 }}>
              Track agents by adding their wallet addresses or their specific VaultKey ID.
            </p>

            <label
              style={{
                border: "1px dashed rgba(30, 106, 255, 0.35)",
                background: "rgba(30, 106, 255, 0.04)",
                borderRadius: "10px",
                padding: "14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Upload size={18} color="var(--color-primary)" />
                <div>
                  <div style={{ color: "#fff", fontSize: "0.88rem", fontWeight: 600 }}>Upload Agent Manifest</div>
                  <div style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>JSON with agentAddress and optional vaultKeyId</div>
                </div>
              </div>
              <span className="btn btn-secondary" style={{ padding: "7px 10px", fontSize: "0.76rem" }}>
                Choose File
              </span>
              <input
                type="file"
                accept="application/json,.json"
                onChange={handleManifestUpload}
                style={{ display: "none" }}
              />
            </label>

            <div style={{ display: "flex", borderBottom: "1px solid var(--border-light)", gap: "12px", paddingBottom: "4px" }}>
              <button
                onClick={() => { setImportType("address"); setImportError(""); setImportSuccess(""); }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: importType === "address" ? "var(--color-primary)" : "var(--text-secondary)",
                  borderBottom: importType === "address" ? "2px solid var(--color-primary)" : "none",
                  padding: "4px 8px",
                  fontSize: "0.85rem",
                  fontWeight: importType === "address" ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                Agent Address
              </button>
              <button
                onClick={() => { setImportType("key"); setImportError(""); setImportSuccess(""); }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: importType === "key" ? "var(--color-primary)" : "var(--text-secondary)",
                  borderBottom: importType === "key" ? "2px solid var(--color-primary)" : "none",
                  padding: "4px 8px",
                  fontSize: "0.85rem",
                  fontWeight: importType === "key" ? 600 : 400,
                  cursor: "pointer",
                }}
              >
                VaultKey ID
              </button>
            </div>

            <form onSubmit={handleImport} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                  {importType === "address" ? "Agent Wallet Address (0x...)" : "VaultKey Object ID (0x...)"}
                </label>
                <input
                  type="text"
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  placeholder="0x..."
                  style={{ fontSize: "0.85rem", padding: "10px" }}
                  required
                />
              </div>

              {importError && (
                <div style={{ background: "var(--color-danger-glow)", color: "var(--color-danger)", padding: "8px", borderRadius: "6px", fontSize: "0.8rem" }}>
                  {importError}
                </div>
              )}

              {importSuccess && (
                <div style={{ background: "var(--color-success-glow)", color: "var(--color-success)", padding: "8px", borderRadius: "6px", fontSize: "0.8rem" }}>
                  {importSuccess}
                </div>
              )}

              <button type="submit" className="btn btn-secondary" style={{ width: "100%", padding: "10px", fontWeight: 600 }}>
                Import Profile
              </button>
            </form>

            {/* Tracked Addresses List */}
            {importedAddresses.length > 0 && (
              <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>Tracked Addresses:</span>
                {importedAddresses.map((addr) => (
                  <div key={addr} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                    <span className="font-mono" style={{ fontSize: "0.75rem", color: "#fff" }}>
                      {addr.substring(0, 8)}...{addr.substring(addr.length - 6)}
                    </span>
                    <button
                      onClick={() => handleRemoveAddress(addr)}
                      style={{ background: "transparent", border: "none", color: "var(--color-danger)", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px" }}
                      title="Remove address"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Tracked Key IDs List */}
            {importedKeyIds.length > 0 && (
              <div style={{ marginTop: "4px", display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>Tracked Key Objects:</span>
                {importedKeyIds.map((id) => (
                  <div key={id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,0.02)", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border-light)" }}>
                    <span className="font-mono" style={{ fontSize: "0.75rem", color: "#fff" }}>
                      {id.substring(0, 8)}...{id.substring(id.length - 6)}
                    </span>
                    <button
                      onClick={() => handleRemoveKeyId(id)}
                      style={{ background: "transparent", border: "none", color: "var(--color-danger)", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px" }}
                      title="Remove Key ID"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* WIDGET 2: Spend Simulation */}
          <div>
            {activeSpendKey ? (
              <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                  <Search size={18} color="var(--color-primary)" />
                  Spend Simulator
                </h3>

                <div>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                    Selected Vault:
                  </span>
                  <span style={{ fontSize: "0.95rem", fontWeight: 500, color: "var(--color-primary)" }}>
                    {activeSpendKey.vault?.name || "Unknown Vault"}
                  </span>
                </div>

                {!isConnected && (
                  <div style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.2)",
                    borderRadius: "8px",
                    padding: "10px",
                    fontSize: "0.8rem",
                    color: "var(--color-danger)",
                    display: "flex",
                    gap: "8px",
                    alignItems: "flex-start",
                  }}>
                    <Wallet size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                    <div>
                      <strong>Wallet Disconnected</strong>
                      <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>
                        To execute a spend transaction, you must connect the authorized agent wallet ({activeSpendKey.key.agentAddress.substring(0, 8)}...).
                      </div>
                    </div>
                  </div>
                )}

                {activeAddress && activeAddress.toLowerCase() !== activeSpendKey.key.agentAddress.toLowerCase() && (
                  <div style={{
                    background: "rgba(245, 158, 11, 0.08)",
                    border: "1px solid rgba(245, 158, 11, 0.2)",
                    borderRadius: "8px",
                    padding: "10px",
                    fontSize: "0.8rem",
                    color: "var(--color-warning)",
                    display: "flex",
                    gap: "8px",
                    alignItems: "flex-start",
                  }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: "2px" }} />
                    <div>
                      <strong>Wallet Address Mismatch</strong>
                      <div style={{ fontSize: "0.75rem", opacity: 0.9 }}>
                        The connected wallet ({activeAddress.substring(0, 8)}...) is not the authorized agent ({activeSpendKey.key.agentAddress.substring(0, 8)}...). Transaction will abort.
                      </div>
                    </div>
                  </div>
                )}

                {spendError && (
                  <div style={{
                    background: "var(--color-danger-glow)",
                    color: "var(--color-danger)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: "8px",
                    padding: "10px",
                    fontSize: "0.85rem",
                    display: "flex",
                    gap: "6px",
                  }}>
                    <XCircle size={16} style={{ flexShrink: 0 }} />
                    {spendError}
                  </div>
                )}

                {spendSuccess && (
                  <div style={{
                    background: "var(--color-success-glow)",
                    color: "var(--color-success)",
                    border: "1px solid rgba(16,185,129,0.2)",
                    borderRadius: "8px",
                    padding: "10px",
                    fontSize: "0.85rem",
                    display: "flex",
                    gap: "6px",
                  }}>
                    <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                    {spendSuccess}
                  </div>
                )}

                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                    Recipient Address
                  </label>
                  <input 
                    type="text" 
                    value={recipient} 
                    onChange={(e) => setRecipient(e.target.value)} 
                    placeholder="0x..." 
                    style={{ fontSize: "0.85rem" }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
                    Spend Amount (SUI)
                  </label>
                  <input 
                    type="number" 
                    value={amountSui} 
                    onChange={(e) => setAmountSui(e.target.value)} 
                    placeholder="0.1" 
                    step="0.01"
                  />
                </div>

                <button 
                  className="btn btn-primary" 
                  onClick={handleSpend} 
                  disabled={spendLoading || !recipient || !amountSui || !isConnected}
                  style={{ width: "100%", padding: "12px", marginTop: "8px" }}
                >
                  {spendLoading ? "Signing transaction..." : "Submit Spend Transaction"}
                </button>
              </div>
            ) : (
              <div className="glass-panel" style={{
                textAlign: "center",
                padding: "40px 20px",
                color: "var(--text-muted)",
                fontSize: "0.9rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                border: "1px dashed var(--border-light)",
              }}>
                <AlertTriangle size={24} />
                Select an active key from the list to test spending simulation.
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
