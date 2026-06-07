"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSuiClient } from "@mysten/dapp-kit";
import { Shield, ShieldAlert, Coins, RefreshCw, Key, Ban, User, ArrowUpRight, ArrowDownLeft, Plus } from "lucide-react";
import { vaultClient } from "../../../lib/suivault";
import { parseVaultError, mistToSui, suiToMist } from "../../../../sdk/client";
import { KillSwitch } from "../../../components/KillSwitch";
import { PolicyEditor } from "../../../components/PolicyEditor";
import { ActivityFeed } from "../../../components/ActivityFeed";
import type { Vault, VaultKey } from "../../../../sdk/types";
import { useUnifiedExecutor } from "../../../hooks/useUnifiedExecutor";

// Beautiful, pre-populated showcase vaults to populate the dashboard and UI on start
const DEMO_VAULTS: Vault[] = [
  {
    id: "demo-vault-arbitrage",
    name: "DeFi Arbitrage Agent (Demo)",
    owner: "0x142df8eaa1bfa7554bc9a71d9105f5a4b039e66ea5e55ea4b38bcb83cb684dc0",
    balance: 450500000000n, // 450.5 SUI
    todaySpent: 35000000000n, // 35 SUI
    totalSpent: 1205000000000n, // 1205 SUI
    agentKeyId: "demo-key-arbitrage",
    isFrozen: false,
    createdAtMs: Date.now() - 10 * 86400000,
    lastResetMs: Date.now(),
    policy: {
      maxPerTx: 50000000000n, // 50 SUI
      maxPerDay: 100000000000n, // 100 SUI
      allowedRecipients: ["0xdeeb000000000000000000000000000000000000000000000000000000000000"],
      activeHoursStart: 0,
      activeHoursEnd: 0,
      isDeepbookOnly: false,
      deepbookPool: "0x0000000000000000000000000000000000000000000000000000000000000000",
      maxPrice: 0n,
      minPrice: 0n,
    },
  },
  {
    id: "demo-vault-meme",
    name: "MEME Accumulator Bot (Demo)",
    owner: "0x142df8eaa1bfa7554bc9a71d9105f5a4b039e66ea5e55ea4b38bcb83cb684dc0",
    balance: 120000000000n, // 120.0 SUI
    todaySpent: 10000000000n, // 10 SUI
    totalSpent: 540000000000n, // 540 SUI
    agentKeyId: "demo-key-meme",
    isFrozen: false,
    createdAtMs: Date.now() - 5 * 86400000,
    lastResetMs: Date.now(),
    policy: {
      maxPerTx: 20000000000n, // 20 SUI
      maxPerDay: 50000000000n, // 50 SUI
      allowedRecipients: ["0xae00000000000000000000000000000000000000000000000000000000000000"],
      activeHoursStart: 9,
      activeHoursEnd: 17,
      isDeepbookOnly: false,
      deepbookPool: "0x0000000000000000000000000000000000000000000000000000000000000000",
      maxPrice: 0n,
      minPrice: 0n,
    },
  },
  {
    id: "demo-vault-liquidator",
    name: "Liquidator Swarm (Demo - Frozen)",
    owner: "0x142df8eaa1bfa7554bc9a71d9105f5a4b039e66ea5e55ea4b38bcb83cb684dc0",
    balance: 2500000000000n, // 2500 SUI
    todaySpent: 0n,
    totalSpent: 15400000000000n, // 15400 SUI
    agentKeyId: "demo-key-liquidator",
    isFrozen: true,
    createdAtMs: Date.now() - 30 * 86400000,
    lastResetMs: Date.now(),
    policy: {
      maxPerTx: 250000000000n, // 250 SUI
      maxPerDay: 500000000000n, // 500 SUI
      allowedRecipients: [],
      activeHoursStart: 0,
      activeHoursEnd: 0,
      isDeepbookOnly: true,
      deepbookPool: "0x76e4f4311ea9c7cafeb45ad5817e784887e7021ac4595b3e6baf514cf3e725b9",
      maxPrice: 12000000n,
      minPrice: 8000000n,
    },
  },
];

export default function VaultDetail() {
  const params = useParams();
  const router = useRouter();
  const { executeTransaction, activeAddress, isMock } = useUnifiedExecutor();
  const suiClient = useSuiClient();

  const vaultId = params.id as string;

  const [vault, setVault] = useState<Vault | null>(null);
  const [capId, setCapId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [agentKey, setAgentKey] = useState<VaultKey | null>(null);

  // Modals state
  const [activeModal, setActiveModal] = useState<"deposit" | "withdraw" | "issueKey" | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [modalLoading, setModalLoading] = useState(false);

  // Issue key fields
  const [newAgentAddr, setNewAgentAddr] = useState("");
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDurationMs, setNewAgentDurationMs] = useState("86400000");

  const loadVaultData = async () => {
    try {
      setErrorMsg("");
      
      if (vaultId.startsWith("demo-vault-")) {
        const stored = localStorage.getItem(`demo-vault-${vaultId}`);
        let parsed;
        if (stored) {
          parsed = JSON.parse(stored);
          parsed.balance = BigInt(parsed.balance);
          parsed.todaySpent = BigInt(parsed.todaySpent);
          parsed.totalSpent = BigInt(parsed.totalSpent);
          parsed.policy.maxPerTx = BigInt(parsed.policy.maxPerTx);
          parsed.policy.maxPerDay = BigInt(parsed.policy.maxPerDay);
          parsed.policy.maxPrice = BigInt(parsed.policy.maxPrice);
          parsed.policy.minPrice = BigInt(parsed.policy.minPrice);
          setVault(parsed);
        } else {
          const matched = DEMO_VAULTS.find(v => v.id === vaultId);
          if (!matched) {
            setErrorMsg("Demo vault not found");
            return;
          }
          setVault(matched);
          parsed = matched;
        }
        setCapId("demo-cap-id");
        if (parsed.agentKeyId) {
          setAgentKey({
            id: parsed.agentKeyId,
            vaultId: parsed.id,
            agentAddress: "0x8a92f0338f2921b72a912e75e9f82637018ce801",
            expiresAtMs: Date.now() + 5 * 86400000,
            agentName: parsed.id === "demo-vault-arbitrage" ? "DeFi Agent" : parsed.id === "demo-vault-meme" ? "MEME Bot" : "Liquidator Bot",
            issuedAtMs: Date.now() - 5 * 86400000,
            reputationScore: parsed.id === "demo-vault-arbitrage" ? 48 : parsed.id === "demo-vault-meme" ? 12 : 0,
          });
        } else {
          setAgentKey(null);
        }
        setLoading(false);
        return;
      }

      const data = await vaultClient.getVault(vaultId);
      if (!data) {
        setErrorMsg("Vault not found or failed to fetch");
        return;
      }
      setVault(data);

      if (data.agentKeyId) {
        try {
          const keyData = await vaultClient.getVaultKey(data.agentKeyId);
          setAgentKey(keyData);
        } catch (e) {
          console.error("Failed to load agent key details:", e);
        }
      } else {
        setAgentKey(null);
      }

      if (activeAddress) {
        if (isMock) {
          // In mock mode, simulate finding an owner capability
          setCapId("0xmock_owner_cap_" + vaultId.substring(2, 8));
        } else {
          const owned = await suiClient.getOwnedObjects({
            owner: activeAddress,
            filter: { StructType: `${vaultClient["packageId"]}::vault::VaultOwnerCap` },
            options: { showContent: true },
          });
          
          // Find cap matching this vault ID
          for (const item of owned.data) {
            const content = item.data?.content as any;
            if (content?.fields?.vault_id === vaultId) {
              setCapId(item.data?.objectId || "");
              break;
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load vault details:", e);
      setErrorMsg("Failed to read vault state from RPC");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (vaultId) {
      loadVaultData();
    }
  }, [vaultId, activeAddress]);

  const saveDemoVaultState = (updatedVault: Vault) => {
    localStorage.setItem(`demo-vault-${vaultId}`, JSON.stringify(updatedVault, (key, value) => 
      typeof value === 'bigint' ? value.toString() : value
    ));
    setVault(updatedVault);
  };

  const handleKillSwitchStateChange = () => {
    if (vaultId.startsWith("demo-vault-") && vault) {
      const updated = { ...vault, isFrozen: !vault.isFrozen };
      saveDemoVaultState(updated);
    } else {
      loadVaultData();
    }
  };

  const handleDeposit = async () => {
    if (!amountInput || Number(amountInput) <= 0) return;
    setModalLoading(true);
    try {
      const depositVal = suiToMist(Number(amountInput));

      if (vaultId.startsWith("demo-vault-")) {
        await executeTransaction(null as any, { description: "Deposit Funds to Vault" });
        if (vault) {
          const updated = { ...vault, balance: vault.balance + depositVal };
          saveDemoVaultState(updated);
        }
        setModalLoading(false);
        setActiveModal(null);
        setAmountInput("");
        return;
      }

      const { Transaction } = await import("@mysten/sui/transactions");
      const tx = new Transaction();

      if (!isMock) {
        // Fetch all SUI coin objects owned by the user
        const coins = await suiClient.getCoins({ 
          owner: activeAddress!, 
          coinType: "0x2::sui::SUI" 
        });
        
        if (coins.data.length === 0) {
          throw new Error("No SUI coins available in wallet to perform deposit");
        }
        
        const sortedCoins = [...coins.data].sort((a, b) => 
          Number(b.balance) - Number(a.balance)
        );
        
        const primaryCoin = sortedCoins[0];
        const primaryBalance = BigInt(primaryCoin.balance);
        let depositCoinInput;
        
        if (primaryBalance >= depositVal + 50_000_000n) {
          const [splitCoin] = tx.splitCoins(tx.object(primaryCoin.coinObjectId), [
            tx.pure.u64(depositVal)
          ]);
          depositCoinInput = splitCoin;
        } else {
          const coinsToMerge: string[] = [];
          let accumulatedBalance = primaryBalance;
          
          for (let i = 1; i < sortedCoins.length; i++) {
            if (accumulatedBalance >= depositVal + 50_000_000n) break;
            coinsToMerge.push(sortedCoins[i].coinObjectId);
            accumulatedBalance += BigInt(sortedCoins[i].balance);
          }
          
          if (accumulatedBalance < depositVal + 50_000_000n) {
            throw new Error(`Insufficient SUI funds to cover deposit (${amountInput} SUI) and network gas buffer.`);
          }
          
          if (coinsToMerge.length > 0) {
            tx.mergeCoins(
              tx.object(primaryCoin.coinObjectId),
              coinsToMerge.map(id => tx.object(id))
            );
          }
          
          const [splitCoin] = tx.splitCoins(tx.object(primaryCoin.coinObjectId), [
            tx.pure.u64(depositVal)
          ]);
          depositCoinInput = splitCoin;
        }

        // Execute on-chain deposit call
        tx.moveCall({
          target: `${vaultClient.packageId}::vault::deposit`,
          typeArguments: [vaultClient.coinType],
          arguments: [
            tx.object(vaultId),
            tx.object(capId),
            depositCoinInput
          ]
        });
      }

      await executeTransaction(tx as any, { description: "Deposit Funds to Vault" });
      setModalLoading(false);
      setActiveModal(null);
      setAmountInput("");
      loadVaultData();
    } catch (e: any) {
      setModalLoading(false);
      alert(e.message || "Failed to initiate deposit");
    }
  };

  const handleWithdraw = async () => {
    if (!amountInput || Number(amountInput) <= 0) return;
    setModalLoading(true);
    try {
      const withdrawVal = suiToMist(Number(amountInput));

      if (vaultId.startsWith("demo-vault-")) {
        await executeTransaction(null as any, { description: "Withdraw Funds from Vault" });
        if (vault) {
          if (vault.balance < withdrawVal) {
            throw new Error("Insufficient Balance in Vault");
          }
          const updated = { ...vault, balance: vault.balance - withdrawVal };
          saveDemoVaultState(updated);
        }
        setModalLoading(false);
        setActiveModal(null);
        setAmountInput("");
        return;
      }

      let tx;
      if (!isMock) {
        tx = vaultClient.buildWithdraw(vaultId, capId, withdrawVal);
      } else {
        const { Transaction } = await import("@mysten/sui/transactions");
        tx = new Transaction();
      }

      await executeTransaction(tx as any, { description: "Withdraw Funds from Vault" });
      setModalLoading(false);
      setActiveModal(null);
      setAmountInput("");
      loadVaultData();
    } catch (e: any) {
      setModalLoading(false);
      alert(e.message || "Failed to initiate withdrawal");
    }
  };

  const handleRevokeKey = async () => {
    if (!vault?.agentKeyId) return;
    if (!confirm("Are you sure you want to revoke the active agent's key?")) return;
    setLoading(true);
    try {
      if (vaultId.startsWith("demo-vault-")) {
        await executeTransaction(null as any, { description: "Revoke Agent Key" });
        const updated = { ...vault, agentKeyId: null };
        saveDemoVaultState(updated);
        setLoading(false);
        return;
      }

      let tx;
      if (!isMock) {
        tx = vaultClient.buildRevokeKey(vaultId, capId, vault.agentKeyId);
      } else {
        const { Transaction } = await import("@mysten/sui/transactions");
        tx = new Transaction();
      }

      await executeTransaction(tx as any, { description: "Revoke Agent Key" });
      loadVaultData();
    } catch (e: any) {
      setLoading(false);
      alert(e.message || "Failed to build revocation");
    }
  };

  const handleIssueKey = async () => {
    if (!newAgentAddr.startsWith("0x")) return;
    setModalLoading(true);
    try {
      if (vaultId.startsWith("demo-vault-")) {
        await executeTransaction(null as any, { description: "Issue Agent Key" });
        if (vault) {
          const updated = { ...vault, agentKeyId: "demo-key-issued-" + Math.random().toString(36).substring(2, 6) };
          saveDemoVaultState(updated);
        }
        setModalLoading(false);
        setActiveModal(null);
        setNewAgentAddr("");
        setNewAgentName("");
        return;
      }

      let tx;
      if (!isMock) {
        tx = vaultClient.buildIssueNewKey(
          vaultId,
          capId,
          newAgentAddr,
          newAgentName,
          Number(newAgentDurationMs)
        );
      } else {
        const { Transaction } = await import("@mysten/sui/transactions");
        tx = new Transaction();
      }

      await executeTransaction(tx as any, { description: "Issue Agent Key" });
      setModalLoading(false);
      setActiveModal(null);
      setNewAgentAddr("");
      setNewAgentName("");
      loadVaultData();
    } catch (e: any) {
      setModalLoading(false);
      alert(e.message || "Failed to build issue key");
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "120px 0" }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (errorMsg || !vault) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <h2 style={{ color: "var(--color-danger)" }}>Error Loading Vault</h2>
        <p style={{ color: "var(--text-secondary)", marginTop: "10px" }}>{errorMsg || "SuiVault is unreachable"}</p>
        <button className="btn btn-secondary" onClick={() => router.push("/")} style={{ marginTop: "20px" }}>
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: "10px" }}>
            {vault.name}
            {vault.isFrozen ? (
              <span className="badge badge-danger"><ShieldAlert size={12} />Frozen</span>
            ) : (
              <span className="badge badge-success"><Shield size={12} />Active</span>
            )}
          </h1>
          <span className="font-mono" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Vault ID: {vault.id}
          </span>
        </div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn btn-secondary" onClick={() => setActiveModal("deposit")}>
            <ArrowDownLeft size={16} />
            Deposit
          </button>
          <button className="btn btn-secondary" onClick={() => setActiveModal("withdraw")}>
            <ArrowUpRight size={16} />
            Withdraw
          </button>
          <button className="btn btn-secondary" onClick={loadVaultData}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Overview stats layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px", alignItems: "start" }}>
        
        {/* Left Side: Stats and Kill Switch */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          {/* Balance card */}
          <div className="glass-panel" style={{ textAlign: "center", padding: "30px 20px" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              Total Vault Balance
            </span>
            <span style={{ fontSize: "2.5rem", fontWeight: 700, color: "#fff" }}>
              {mistToSui(vault.balance)} <span style={{ fontSize: "1.2rem", color: "var(--color-primary)" }}>SUI</span>
            </span>
          </div>

          {/* Kill Switch Card */}
          <KillSwitch 
            vaultId={vaultId} 
            capId={capId} 
            isFrozen={vault.isFrozen} 
            onStateChange={handleKillSwitchStateChange} 
          />

          {/* Agent Key Details Card */}
          <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "8px" }}>
              <Key size={16} color="var(--color-primary)" />
              Authorized Agent key
            </h3>
            
            {vault.agentKeyId ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "0.85rem" }}>
                <div>
                  <span style={{ color: "var(--text-secondary)" }}>Key Object ID:</span>
                  <span className="font-mono" style={{ color: "#fff", display: "block" }}>{vault.agentKeyId}</span>
                </div>
                {agentKey && (
                  <>
                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>Agent Name:</span>
                      <span style={{ color: "#fff", display: "block", fontWeight: 500 }}>{agentKey.agentName}</span>
                    </div>
                    <div>
                      <span style={{ color: "var(--text-secondary)" }}>Reputation Score:</span>
                      <span style={{ color: "var(--color-primary)", fontWeight: "bold", display: "flex", alignItems: "center", gap: "4px" }}>
                        🏆 {agentKey.reputationScore} Successful Spends
                      </span>
                    </div>
                  </>
                )}
                <button className="btn btn-danger" onClick={handleRevokeKey} style={{ padding: "8px 12px", fontSize: "0.8rem", width: "100%" }}>
                  <Ban size={14} />
                  Revoke Key & Deny Access
                </button>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "10px 0" }}>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "12px" }}>No agent key issued for this vault yet.</p>
                <button className="btn btn-primary" onClick={() => setActiveModal("issueKey")} style={{ width: "100%" }}>
                  <Plus size={14} />
                  Issue Agent Key
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Policy Editor & Activity Feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          
          <PolicyEditor 
            vault={vault} 
            capId={capId} 
            onPolicyUpdated={loadVaultData} 
          />

          <ActivityFeed vaultId={vaultId} />
        </div>
      </div>

      {/* Modals Layer */}
      {activeModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0, 0, 0, 0.7)",
          backdropFilter: "blur(4px)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <div className="glass-panel" style={{ width: "90%", maxWidth: "420px", display: "flex", flexDirection: "column", gap: "16px" }}>
            
            {/* Deposit Modal */}
            {activeModal === "deposit" && (
              <>
                <h3 style={{ color: "#fff" }}>Deposit SUI into Vault</h3>
                <input 
                  type="number" 
                  value={amountInput} 
                  onChange={(e) => setAmountInput(e.target.value)} 
                  placeholder="Amount in SUI" 
                />
                <div style={{ display: "flex", gap: "10px" }}>
                  <button className="btn btn-secondary" onClick={() => setActiveModal(null)} style={{ flex: 1 }}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleDeposit} disabled={modalLoading} style={{ flex: 1 }}>
                    {modalLoading ? "Confirming..." : "Deposit"}
                  </button>
                </div>
              </>
            )}

            {/* Withdraw Modal */}
            {activeModal === "withdraw" && (
              <>
                <h3 style={{ color: "#fff" }}>Withdraw SUI from Vault</h3>
                <input 
                  type="number" 
                  value={amountInput} 
                  onChange={(e) => setAmountInput(e.target.value)} 
                  placeholder="Amount in SUI" 
                />
                <div style={{ display: "flex", gap: "10px" }}>
                  <button className="btn btn-secondary" onClick={() => setActiveModal(null)} style={{ flex: 1 }}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleWithdraw} disabled={modalLoading} style={{ flex: 1 }}>
                    {modalLoading ? "Confirming..." : "Withdraw"}
                  </button>
                </div>
              </>
            )}

            {/* Issue Key Modal */}
            {activeModal === "issueKey" && (
              <>
                <h3 style={{ color: "#fff" }}>Issue New Agent Key</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Agent Address</label>
                    <input type="text" value={newAgentAddr} onChange={(e) => setNewAgentAddr(e.target.value)} placeholder="0x..." />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Agent Name</label>
                    <input type="text" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} placeholder="e.g. DeFi Bot" />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>Validity Duration</label>
                    <select value={newAgentDurationMs} onChange={(e) => setNewAgentDurationMs(e.target.value)}>
                      <option value="86400000">1 Day</option>
                      <option value="604800000">7 Days</option>
                      <option value="2592000000">30 Days</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                  <button className="btn btn-secondary" onClick={() => setActiveModal(null)} style={{ flex: 1 }}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleIssueKey} disabled={modalLoading} style={{ flex: 1 }}>
                    {modalLoading ? "Issuing..." : "Issue Key"}
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
