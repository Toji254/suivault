"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSuiClient } from "@mysten/dapp-kit";
import { Shield, ArrowRight, ArrowLeft, Sliders, Cpu, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { vaultClient } from "../../lib/suivault";
import { parseVaultError, suiToMist } from "../../../sdk/client";
import { PolicyPresets, VAULT_TEMPLATES, type Vault } from "../../../sdk/types";
import { useUnifiedExecutor } from "../../hooks/useUnifiedExecutor";

const LOCAL_VAULTS_KEY = "suivault_local_created_vaults";
type PresetId = (typeof VAULT_TEMPLATES)[number]["id"] | "deepbook" | "custom";

function serializeVault(vault: Vault) {
  return JSON.parse(JSON.stringify(vault, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value
  ));
}

function saveLocalCreatedVault(vault: Vault) {
  try {
    const existing = JSON.parse(localStorage.getItem(LOCAL_VAULTS_KEY) || "[]");
    const serialized = serializeVault(vault);
    const next = [serialized, ...existing.filter((item: any) => item.id !== vault.id)].slice(0, 20);
    localStorage.setItem(LOCAL_VAULTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("suivault-local-vaults-update"));
  } catch (e) {
    console.error("Failed to save created vault snapshot:", e);
  }
}

export default function CreateVault() {
  const { executeTransaction, isConnected, activeAddress, isMock } = useUnifiedExecutor();
  const suiClient = useSuiClient();
  const router = useRouter();

  // Form Step State
  const [step, setStep] = useState(1);
  const [walletBalance, setWalletBalance] = useState("0.0000");

  // Step 1 State: Core Details
  const [name, setName] = useState("Trading Co-Pilot");
  const [deposit, setDeposit] = useState("1.0");

  // Step 2 State: Agent Details
  const [agentAddress, setAgentAddress] = useState("");
  const [agentName, setAgentName] = useState("DeFi Bot-1");
  const [durationPreset, setDurationPreset] = useState("86400000"); // 1 day
  const [customDurationMs, setCustomDurationMs] = useState("");

  // Step 3 State: Policy Details
  const [preset, setPreset] = useState<PresetId>("payment-agent");
  const [maxPerTx, setMaxPerTx] = useState("0.1");
  const [maxPerDay, setMaxPerDay] = useState("0.5");
  const [activeHoursStart, setActiveHoursStart] = useState(0);
  const [activeHoursEnd, setActiveHoursEnd] = useState(0);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [newRecipient, setNewRecipient] = useState("");

  // DeepBook Specific State
  const [isDeepbookOnly, setIsDeepbookOnly] = useState(false);
  const [deepbookPool, setDeepbookPool] = useState("");
  const [maxPrice, setMaxPrice] = useState("0");
  const [minPrice, setMinPrice] = useState("0");

  // Submission State
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Load wallet SUI balance
  useEffect(() => {
    async function loadBalance() {
      if (!activeAddress) return;
      try {
        const bal = await suiClient.getBalance({ owner: activeAddress });
        setWalletBalance((Number(bal.totalBalance) / 1_000_000_000).toFixed(4));
      } catch (e) {
        console.error("Failed to load balance:", e);
      }
    }
    loadBalance();
  }, [activeAddress, suiClient]);

  // Apply Presets
  const handlePresetSelect = (p: PresetId) => {
    setPreset(p);
    setErrorMsg("");
    let config;
    const template = VAULT_TEMPLATES.find((item) => item.id === p);

    if (template) {
      config = template.policy;
    } else if (p === "deepbook") {
      config = PolicyPresets.deepbook(
        "0xdeeb000000000000000000000000000000000000000000000000000000000000",
        BigInt(100),
        BigInt(10)
      );
    } else {
      return; // custom allows manual editing
    }

    setMaxPerTx((Number(config.maxPerTx) / 1_000_000_000).toString());
    setMaxPerDay((Number(config.maxPerDay) / 1_000_000_000).toString());
    setActiveHoursStart(config.activeHoursStart);
    setActiveHoursEnd(config.activeHoursEnd);
    setIsDeepbookOnly(config.isDeepbookOnly);
    setDeepbookPool(config.deepbookPool || "");
    setMaxPrice(config.maxPrice.toString());
    setMinPrice(config.minPrice.toString());
  };

  // Run initial moderate preset on mount
  useEffect(() => {
    handlePresetSelect("payment-agent");
  }, []);

  const handleAddRecipient = () => {
    if (!newRecipient.startsWith("0x") || newRecipient.length < 10) {
      return setErrorMsg("Invalid Sui address format");
    }
    if (recipients.includes(newRecipient)) return;
    setRecipients([...recipients, newRecipient]);
    setNewRecipient("");
    setErrorMsg("");
    setPreset("custom"); // Change preset to custom if modifying whitelist
  };

  const handleRemoveRecipient = (idx: number) => {
    setRecipients(recipients.filter((_, i) => i !== idx));
    setPreset("custom");
  };

  const nextStep = () => {
    setErrorMsg("");
    if (step === 1) {
      if (!name.trim()) return setErrorMsg("Vault name is required");
      if (Number(deposit) <= 0) return setErrorMsg("Initial deposit must be greater than 0");
    } else if (step === 2) {
      if (!agentAddress.startsWith("0x") || agentAddress.length < 10) {
        return setErrorMsg("Invalid agent Sui address");
      }
      if (!agentName.trim()) return setErrorMsg("Agent name is required");
    }
    setStep(step + 1);
  };

  const prevStep = () => {
    setErrorMsg("");
    setStep(step - 1);
  };

  const getFinalDuration = () => {
    return durationPreset === "custom" ? Number(customDurationMs) : Number(durationPreset);
  };

  const handleCreate = async () => {
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      let coinObjectId = "0x0000000000000000000000000000000000000000000000000000000000000000";
      let tx;

      if (!isMock) {
        // Find SUI coin object to spend
        const coins = await suiClient.getCoins({ owner: activeAddress!, coinType: "0x2::sui::SUI" });
        if (coins.data.length === 0) {
          throw new Error("No SUI coins found in owner's wallet to fund deposit");
        }
        coinObjectId = coins.data[0].coinObjectId;

        tx = vaultClient.buildCreateVault({
          coinObjectId,
          name,
          agentAddress,
          agentName,
          keyDurationMs: getFinalDuration(),
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
          },
          depositAmount: suiToMist(Number(deposit)),
        });
      } else {
        // Simulated mock tx block
        const { Transaction } = await import("@mysten/sui/transactions");
        tx = new Transaction();
      }

      const result = await executeTransaction(tx as any, { description: "Create Agent Vault" });

      let createdVault: Vault | null = null;
      if (!isMock && result.digest) {
        try {
          const txBlock = await suiClient.getTransactionBlock({
            digest: result.digest,
            options: { showObjectChanges: true },
          });
          const createdVaultChange = txBlock.objectChanges?.find((change: any) =>
            change.type === "created" &&
            typeof change.objectType === "string" &&
            change.objectType.includes("::vault::Vault<")
          ) as { objectId?: string } | undefined;
          const createdVaultId = createdVaultChange?.objectId;

          if (createdVaultId) {
            createdVault = await vaultClient.getVault(createdVaultId);
          }
        } catch (e) {
          console.error("Failed to resolve created vault object:", e);
        }
      }

      const vaultSnapshot: Vault = createdVault || {
        id: isMock ? `local-vault-${Date.now()}` : `pending-vault-${result.digest}`,
        name,
        owner: activeAddress!,
        balance: suiToMist(Number(deposit)),
        todaySpent: 0n,
        totalSpent: 0n,
        agentKeyId: null,
        isFrozen: false,
        createdAtMs: Date.now(),
        lastResetMs: Date.now(),
        policy: {
          maxPerTx: suiToMist(Number(maxPerTx)),
          maxPerDay: suiToMist(Number(maxPerDay)),
          allowedRecipients: recipients,
          activeHoursStart,
          activeHoursEnd,
          isDeepbookOnly,
          deepbookPool: deepbookPool || "0x0000000000000000000000000000000000000000000000000000000000000000",
          maxPrice: BigInt(maxPrice || 0),
          minPrice: BigInt(minPrice || 0),
        },
      };

      saveLocalCreatedVault(vaultSnapshot);

      setLoading(false);
      setSuccessMsg("Vault and Agent Key created successfully. Returning to dashboard...");
      setTimeout(() => {
        router.push("/");
      }, 800);
    } catch (e: any) {
      setLoading(false);
      setErrorMsg(e.message || "An error occurred during vault initialization");
    }
  };

  if (!isConnected) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <h2 style={{ color: "#fff" }}>Please Connect Your Wallet First</h2>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: "1120px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "24px" }}>
      <div>
        <h1 style={{ fontSize: "1.8rem", fontWeight: 700, color: "#fff", marginBottom: "4px" }}>
          Deploy New Agent Guardrail
        </h1>
        <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
          Step {step} of 4: {
            step === 1 ? "Core Details" : 
            step === 2 ? "Assign Agent" : 
            step === 3 ? "Guardrail Rules" : "Review & Deploy"
          }
        </span>
      </div>

      {errorMsg && (
        <div style={{ background: "var(--color-danger-glow)", color: "var(--color-danger)", padding: "12px", borderRadius: "10px", fontSize: "0.85rem" }}>
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div style={{ background: "var(--color-success-glow)", color: "var(--color-success)", padding: "12px", borderRadius: "10px", fontSize: "0.85rem" }}>
          {successMsg}
        </div>
      )}

      <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        
        {/* STEP 1: Core Details */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>Vault Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. DeFi Trading Co-Pilot" />
            </div>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>Initial Funding (SUI)</label>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Available: {walletBalance} SUI</span>
              </div>
              <input type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} placeholder="1.0" step="0.1" />
            </div>
          </div>
        )}

        {/* STEP 2: Assign Agent */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>Agent Wallet Address (0x...)</label>
              <input type="text" value={agentAddress} onChange={(e) => setAgentAddress(e.target.value)} placeholder="Recipient address of the AI bot" />
            </div>
            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>Agent Name / Tag</label>
              <input type="text" value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="e.g. Sentinel-1" />
            </div>
            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>Key Validity Duration</label>
              <select value={durationPreset} onChange={(e) => setDurationPreset(e.target.value)}>
                <option value="3600000">1 Hour</option>
                <option value="86400000">1 Day</option>
                <option value="604800000">7 Days</option>
                <option value="2592000000">30 Days</option>
                <option value="custom">Custom (ms)</option>
              </select>
              {durationPreset === "custom" && (
                <input 
                  type="number" 
                  value={customDurationMs} 
                  onChange={(e) => setCustomDurationMs(e.target.value)} 
                  placeholder="Duration in ms" 
                  style={{ marginTop: "8px" }}
                />
              )}
            </div>
          </div>
        )}

        {/* STEP 3: Guardrail Rules */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
              <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "8px" }}>Select Preset Template</label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {VAULT_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={`btn ${preset === template.id ? "btn-primary" : "btn-secondary"}`}
                    onClick={() => handlePresetSelect(template.id)}
                    title={template.description}
                    style={{ fontSize: "0.8rem", padding: "6px 12px" }}
                  >
                    {template.name}
                  </button>
                ))}
                <button type="button" className={`btn ${preset === "deepbook" ? "btn-primary" : "btn-secondary"}`} onClick={() => handlePresetSelect("deepbook")} style={{ fontSize: "0.8rem", padding: "6px 12px", border: preset === "deepbook" ? "none" : "1px solid rgba(30, 106, 255, 0.4)", color: preset === "deepbook" ? "#fff" : "#a3c4ff" }}>📈 DeepBook</button>
                <button type="button" className={`btn ${preset === "custom" ? "btn-primary" : "btn-secondary"}`} onClick={() => handlePresetSelect("custom")} style={{ fontSize: "0.8rem", padding: "6px 12px" }}>⚙️ Custom</button>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>Max Per Transaction (SUI)</label>
                <input 
                  type="number" 
                  value={maxPerTx} 
                  onChange={(e) => { setMaxPerTx(e.target.value); setPreset("custom"); }} 
                />
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>Daily Budget (SUI)</label>
                <input 
                  type="number" 
                  value={maxPerDay} 
                  onChange={(e) => { setMaxPerDay(e.target.value); setPreset("custom"); }} 
                />
              </div>
            </div>

            {/* DeepBook restriction sub-panel */}
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
                  <span style={{ fontSize: "0.9rem", fontWeight: 500, color: "#fff" }}>DeepBook Trading Only</span>
                </div>
                <input
                  type="checkbox"
                  checked={isDeepbookOnly}
                  onChange={(e) => { setIsDeepbookOnly(e.target.checked); setPreset("custom"); }}
                  style={{ width: "20px", height: "20px", cursor: "pointer" }}
                />
              </div>

              {isDeepbookOnly && (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
                      Target DeepBook Pool Address (SUI/USDC L3 Pool)
                    </label>
                    <input
                      type="text"
                      value={deepbookPool}
                      onChange={(e) => { setDeepbookPool(e.target.value); setPreset("custom"); }}
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
                        onChange={(e) => { setMaxPrice(e.target.value); setPreset("custom"); }}
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
                        onChange={(e) => { setMinPrice(e.target.value); setPreset("custom"); }}
                        placeholder="e.g. 10"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Start UTC Hour</label>
                <select value={activeHoursStart} onChange={(e) => { setActiveHoursStart(Number(e.target.value)); setPreset("custom"); }}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>End UTC Hour</label>
                <select value={activeHoursEnd} onChange={(e) => { setActiveHoursEnd(Number(e.target.value)); setPreset("custom"); }}>
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i.toString().padStart(2, "0")}:00</option>)}
                </select>
              </div>
            </div>

            {!isDeepbookOnly && (
              <div>
                <label style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>Recipient Whitelist</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="text" value={newRecipient} onChange={(e) => setNewRecipient(e.target.value)} placeholder="0x..." />
                  <button type="button" className="btn btn-secondary" onClick={handleAddRecipient}><Plus size={16} /></button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "10px" }}>
                  {recipients.map((addr, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
                      <span className="font-mono" style={{ fontSize: "0.8rem" }}>{addr}</span>
                      <button type="button" onClick={() => handleRemoveRecipient(idx)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--color-danger)", display: "flex" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Review and Submit */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>Verify Deployment Settings</h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "0.9rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Vault Name:</span>
                <span style={{ color: "#fff", fontWeight: 500 }}>{name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Initial Deposit:</span>
                <span style={{ color: "#fff", fontWeight: 500 }}>{deposit} SUI</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Agent Name:</span>
                <span style={{ color: "#fff", fontWeight: 500 }}>{agentName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Agent Address:</span>
                <span className="font-mono" style={{ color: "#fff" }}>{agentAddress.substring(0, 10)}...</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Per-TX Limit:</span>
                <span style={{ color: "#fff" }}>{maxPerTx} SUI</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--text-secondary)" }}>Daily Budget:</span>
                <span style={{ color: "#fff" }}>{maxPerDay} SUI</span>
              </div>
              {isDeepbookOnly ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", background: "rgba(30, 106, 255, 0.05)", border: "1px solid rgba(30, 106, 255, 0.2)", borderRadius: "8px", padding: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#a3c4ff" }}>DeepBook Restricted:</span>
                    <span style={{ color: "#fff", fontWeight: 500 }}>YES</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#a3c4ff" }}>Target Pool:</span>
                    <span className="font-mono" style={{ color: "#fff", fontSize: "0.8rem" }}>{deepbookPool.substring(0, 14)}...</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#a3c4ff" }}>Safe Corridor:</span>
                    <span style={{ color: "#fff" }}>[{minPrice}, {maxPrice}]</span>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-light)", paddingBottom: "8px" }}>
                  <span style={{ color: "var(--text-secondary)" }}>Whitelisted Recipient Count:</span>
                  <span style={{ color: "#fff" }}>{recipients.length} addresses</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Wizard Controls */}
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          {step > 1 && (
            <button type="button" className="btn btn-secondary" onClick={prevStep} disabled={loading} style={{ flex: 1 }}>
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          {step < 4 ? (
            <button type="button" className="btn btn-primary" onClick={nextStep} style={{ flex: 1 }}>
              Continue
              <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={loading} style={{ flex: 1, background: "var(--color-success)" }}>
              <CheckCircle2 size={16} />
              {loading ? "Deploying Vault..." : "Sign & Create Vault"}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
