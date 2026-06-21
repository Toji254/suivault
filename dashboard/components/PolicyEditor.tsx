"use client";

import { useState } from "react";
import { Sliders, Clock, Plus, Trash2, Save, Cpu } from "lucide-react";
import { vaultClient } from "../lib/suivault";
import { parseVaultError, suiToMist, mistToSui } from "../../sdk/client";
import { SUIVAULT_DEEPBOOK_TESTNET } from "../../sdk/deepbook";
import { PolicyPresets } from "../../sdk/types";
import type { Vault } from "../../sdk/types";
import { useUnifiedExecutor } from "../hooks/useUnifiedExecutor";

interface PolicyEditorProps {
  vault: Vault;
  capId: string;
  onPolicyUpdated: () => void;
}

export function PolicyEditor({ vault, capId, onPolicyUpdated }: PolicyEditorProps) {
  const [maxPerTx, setMaxPerTx] = useState(mistToSui(vault.policy.maxPerTx));
  const [maxPerDay, setMaxPerDay] = useState(mistToSui(vault.policy.maxPerDay));
  const [activeHoursStart, setActiveHoursStart] = useState(vault.policy.activeHoursStart);
  const [activeHoursEnd, setActiveHoursEnd] = useState(vault.policy.activeHoursEnd);
  
  // Whitelist management
  const [recipients, setRecipients] = useState<string[]>(vault.policy.allowedRecipients);
  const [newRecipient, setNewRecipient] = useState("");

  // DeepBook Specific State
  const [isDeepbookOnly, setIsDeepbookOnly] = useState(vault.policy.isDeepbookOnly || false);
  const [deepbookPool, setDeepbookPool] = useState(vault.policy.deepbookPool || "");
  const [maxPrice, setMaxPrice] = useState(String(vault.policy.maxPrice || 0));
  const [minPrice, setMinPrice] = useState(String(vault.policy.minPrice || 0));

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const { executeTransaction } = useUnifiedExecutor();

  const isNonDemoWithoutCap = !vault.id.startsWith("demo-vault-") && !capId;

  const handleAddRecipient = () => {
    if (!newRecipient.startsWith("0x") || newRecipient.length < 10) {
      setErrorMsg("Invalid Sui address format");
      return;
    }
    if (recipients.includes(newRecipient)) return;
    setRecipients([...recipients, newRecipient]);
    setNewRecipient("");
    setErrorMsg("");
  };

  const handleRemoveRecipient = (index: number) => {
    setRecipients(recipients.filter((_, i) => i !== index));
  };

  const applyPreset = (presetName: "conservative" | "moderate" | "aggressive" | "unlimited" | "deepbook") => {
    setErrorMsg("");
    setSuccessMsg("");
    let config;
    if (presetName === "conservative") {
      config = PolicyPresets.conservative(recipients);
    } else if (presetName === "moderate") {
      config = PolicyPresets.moderate(recipients);
    } else if (presetName === "aggressive") {
      config = PolicyPresets.aggressive();
    } else if (presetName === "deepbook") {
      config = PolicyPresets.deepbook(
        SUIVAULT_DEEPBOOK_TESTNET.pools.SUI_DBUSDC.address,
        BigInt(1_000_000_000),
        BigInt(1)
      );
    } else {
      config = PolicyPresets.unlimited();
    }

    setMaxPerTx(mistToSui(config.maxPerTx));
    setMaxPerDay(mistToSui(config.maxPerDay));
    setActiveHoursStart(config.activeHoursStart);
    setActiveHoursEnd(config.activeHoursEnd);
    setIsDeepbookOnly(config.isDeepbookOnly);
    setDeepbookPool(config.deepbookPool || "");
    setMaxPrice(String(config.maxPrice));
    setMinPrice(String(config.minPrice));
  };

  const handleSave = async () => {
    if (isNonDemoWithoutCap) {
      setErrorMsg("Vault Owner Capability not found. Only the vault owner can update policies.");
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    if (vault.id.startsWith("demo-vault-")) {
      try {
        // Demo: update local state directly, no on-chain transaction
        await new Promise((resolve) => setTimeout(resolve, 600));
        const updatedVault = {
          ...vault,
          policy: {
            maxPerTx: suiToMist(Number(maxPerTx)),
            maxPerDay: suiToMist(Number(maxPerDay)),
            allowedRecipients: recipients,
            activeHoursStart,
            activeHoursEnd,
            isDeepbookOnly,
            deepbookPool: deepbookPool || "0x0000000000000000000000000000000000000000000000000000000000000000",
            maxPrice: BigInt(maxPrice || 0),
            minPrice: BigInt(minPrice || 0)
          }
        };
        localStorage.setItem(`demo-vault-${vault.id}`, JSON.stringify(updatedVault, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        ));
        setLoading(false);
        setSuccessMsg("Spending policy successfully updated locally!");
        onPolicyUpdated();
        return;
      } catch (err: any) {
        setLoading(false);
        setErrorMsg(err.message || "Failed to update policy");
        return;
      }
    }

    try {
      const tx = vaultClient.buildUpdatePolicy(vault.id, capId, {
        maxPerTx: suiToMist(Number(maxPerTx)),
        maxPerDay: suiToMist(Number(maxPerDay)),
        allowedRecipients: recipients,
        activeHoursStart,
        activeHoursEnd,
        isDeepbookOnly,
        deepbookPool: deepbookPool || "0x0000000000000000000000000000000000000000000000000000000000000000",
        maxPrice: BigInt(maxPrice || 0),
        minPrice: BigInt(minPrice || 0)
      });

      await executeTransaction(tx as any, { description: "Update Spending Policy" });
      setLoading(false);
      setSuccessMsg("Spending policy successfully updated on-chain!");
      onPolicyUpdated();
    } catch (err: any) {
      setLoading(false);
      console.error("Update policy tx failed:", err);
      const match = err.message?.match(/MoveAbort.*?(\d+)\)/);
      if (match) {
        setErrorMsg(parseVaultError(parseInt(match[1])));
      } else {
        setErrorMsg(err.message || "Transaction execution failed");
      }
    }
  };

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <Sliders size={20} color="var(--color-primary)" />
        <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>
          Edit Spending Policies
        </h3>
      </div>

      {/* Preset Row */}
      <div>
        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>
          Load Preset Template
        </span>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button className="btn btn-secondary" onClick={() => applyPreset("conservative")} style={{ fontSize: "0.85rem", padding: "8px 14px", borderRadius: "8px" }}>
            🛡️ Conservative
          </button>
          <button className="btn btn-secondary" onClick={() => applyPreset("moderate")} style={{ fontSize: "0.85rem", padding: "8px 14px", borderRadius: "8px" }}>
            📊 Moderate
          </button>
          <button className="btn btn-secondary" onClick={() => applyPreset("aggressive")} style={{ fontSize: "0.85rem", padding: "8px 14px", borderRadius: "8px" }}>
            🔥 Aggressive
          </button>
          <button className="btn btn-secondary" onClick={() => applyPreset("deepbook")} style={{ fontSize: "0.85rem", padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(30, 106, 255, 0.4)", color: "#a3c4ff" }}>
            📈 DeepBook Trading Preset
          </button>
          <button className="btn btn-secondary" onClick={() => applyPreset("unlimited")} style={{ fontSize: "0.85rem", padding: "8px 14px", borderRadius: "8px" }}>
            ⚡ Unlimited
          </button>
        </div>
      </div>

      {errorMsg && (
        <div style={{ background: "var(--color-danger-glow)", color: "var(--color-danger)", padding: "10px", borderRadius: "8px", fontSize: "0.85rem" }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ background: "var(--color-success-glow)", color: "var(--color-success)", padding: "10px", borderRadius: "8px", fontSize: "0.85rem" }}>
          {successMsg}
        </div>
      )}

      {/* Limits inputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
        <div>
          <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
            Max Per Transaction (SUI)
          </label>
          <input 
            type="number" 
            value={maxPerTx} 
            onChange={(e) => setMaxPerTx(e.target.value)} 
            placeholder="0.0 for unlimited" 
          />
        </div>
        <div>
          <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
            Daily Spending Limit (SUI)
          </label>
          <input 
            type="number" 
            value={maxPerDay} 
            onChange={(e) => setMaxPerDay(e.target.value)} 
            placeholder="0.0 for unlimited" 
          />
        </div>
      </div>

      {/* DeepBook Policy Sub-engine */}
      <div style={{
        border: "1px solid rgba(30, 106, 255, 0.2)",
        background: "rgba(30, 106, 255, 0.02)",
        padding: "16px",
        borderRadius: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "14px"
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Cpu size={16} color="var(--color-primary)" />
            <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#fff" }}>DeepBook Trading Restriction</span>
          </div>
          <input
            type="checkbox"
            checked={isDeepbookOnly}
            onChange={(e) => setIsDeepbookOnly(e.target.checked)}
            style={{ width: "20px", height: "20px", cursor: "pointer" }}
          />
        </div>

        {isDeepbookOnly && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", animation: "fadeIn 0.3s ease" }}>
            <div>
              <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                Target DeepBook Pool Address (SUI/USDC L3 Pool)
              </label>
              <input
                type="text"
                value={deepbookPool}
                onChange={(e) => setDeepbookPool(e.target.value)}
                placeholder="0xdeeb..."
                style={{ fontSize: "0.85rem" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Max Safe Price Bound
                </label>
                <input
                  type="number"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
              <div>
                <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                  Min Safe Price Bound
                </label>
                <input
                  type="number"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="e.g. 10"
                />
              </div>
            </div>
            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "2px" }}>
              Enforces that the agent can ONLY place orders inside this specific pool and within this safe price corridor.
            </span>
          </div>
        )}
      </div>

      {/* Active Hours */}
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "8px" }}>
          <Clock size={16} color="var(--text-secondary)" />
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Active Hours (UTC Hour of Day)</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>Start Hour</label>
            <select value={activeHoursStart} onChange={(e) => setActiveHoursStart(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", display: "block", marginBottom: "4px" }}>End Hour</label>
            <select value={activeHoursEnd} onChange={(e) => setActiveHoursEnd(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "4px", display: "block" }}>
          Set Start Hour equal to End Hour to allow 24-hour spending.
        </span>
      </div>

      {/* Whitelist */}
      {!isDeepbookOnly && (
        <div>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
            Whitelisted Recipients
          </span>
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            <input 
              type="text" 
              value={newRecipient} 
              onChange={(e) => setNewRecipient(e.target.value)} 
              placeholder="0x..." 
              style={{ fontSize: "0.85rem" }}
            />
            <button className="btn btn-secondary" onClick={handleAddRecipient} style={{ padding: "0 14px" }}>
              <Plus size={16} />
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {recipients.length === 0 ? (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                No whitelist configured. Funds can be spent to any address.
              </span>
            ) : (
              recipients.map((addr, index) => (
                <div key={index} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                  background: "rgba(0, 0, 0, 0.2)",
                  borderRadius: "8px",
                  border: "1px solid var(--border-light)",
                }}>
                  <span className="font-mono" style={{ fontSize: "0.8rem" }}>{addr}</span>
                  <button 
                    onClick={() => handleRemoveRecipient(index)}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--color-danger)",
                      display: "flex",
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Security Disclaimer / formal audit notice */}
      <div style={{
        background: "rgba(245, 158, 11, 0.03)",
        border: "1px solid rgba(245, 158, 11, 0.15)",
        borderRadius: "10px",
        padding: "12px",
        fontSize: "0.75rem",
        color: "var(--text-secondary)",
        lineHeight: "1.45",
        marginTop: "4px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--color-warning)", fontWeight: 600, marginBottom: "4px" }}>
          ⚠️ Security & Audit Notice
        </div>
        SuiVault policy engines enforce safeguards on-chain. As with any vault system managing decentralized assets, a formal third-party security audit is highly recommended before deploying to mainnet with high-value keys.
      </div>

      {/* Save Button */}
      <button 
        className="btn btn-primary" 
        onClick={handleSave} 
        disabled={loading || isNonDemoWithoutCap}
        style={isNonDemoWithoutCap ? { width: "100%", padding: "12px", marginTop: "8px", opacity: 0.5, cursor: "not-allowed" } : { width: "100%", padding: "12px", marginTop: "8px" }}
      >
        <Save size={16} />
        {loading ? "Updating Policy..." : "Update Policy On-Chain"}
      </button>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
