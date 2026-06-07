"use client";

import { useState } from "react";
import { Shield, ShieldAlert, AlertTriangle } from "lucide-react";
import { vaultClient } from "../lib/suivault";
import { parseVaultError } from "../../sdk/client";
import { useUnifiedExecutor } from "../hooks/useUnifiedExecutor";

interface KillSwitchProps {
  vaultId: string;
  capId: string;
  isFrozen: boolean;
  onStateChange: () => void;
}

export function KillSwitch({ vaultId, capId, isFrozen, onStateChange }: KillSwitchProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const { executeTransaction } = useUnifiedExecutor();

  const handleAction = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const tx = isFrozen 
        ? vaultClient.buildUnfreezeVault(vaultId, capId)
        : vaultClient.buildFreezeVault(vaultId, capId);

      await executeTransaction(tx as any, { 
        description: isFrozen ? "Resume Agent Trading" : "Emergency Freeze Vault" 
      });
      setLoading(false);
      setShowConfirm(false);
      onStateChange();
    } catch (err: any) {
      setLoading(false);
      console.error("Killswitch tx failed:", err);
      // Parse Move abort code if possible
      const match = err.message?.match(/MoveAbort.*?(\d+)\)/);
      if (match) {
        setErrorMsg(parseVaultError(parseInt(match[1])));
      } else {
        setErrorMsg(err.message || "Transaction failed");
      }
    }
  };

  return (
    <div className="glass-panel" style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      border: isFrozen ? "1px solid rgba(239, 68, 68, 0.3)" : "1px solid rgba(16, 185, 129, 0.2)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <div style={{
          background: isFrozen ? "var(--color-danger-glow)" : "var(--color-success-glow)",
          borderRadius: "50%",
          width: "48px",
          height: "48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          {isFrozen ? (
            <ShieldAlert size={24} color="var(--color-danger)" />
          ) : (
            <Shield size={24} color="var(--color-success)" />
          )}
        </div>
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, color: "#fff" }}>
            Vault Emergency Kill-Switch
          </h3>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            {isFrozen 
              ? "All agent spending is currently frozen. Resume operations when safe." 
              : "Instantly halt all agent spending transactions globally."
            }
          </span>
        </div>
      </div>

      {errorMsg && (
        <div style={{
          background: "var(--color-danger-glow)",
          border: "1px solid var(--color-danger)",
          borderRadius: "8px",
          padding: "10px",
          fontSize: "0.85rem",
          color: "var(--color-danger)",
        }}>
          Error: {errorMsg}
        </div>
      )}

      {!showConfirm ? (
        <button 
          className={isFrozen ? "btn btn-success" : "btn btn-danger"} 
          onClick={() => setShowConfirm(true)}
          style={{ width: "100%", padding: "12px", fontWeight: 600 }}
        >
          {isFrozen ? "☀️  Resume Agent Trading" : "❄️  FREEZE VAULT NOW"}
        </button>
      ) : (
        <div style={{
          background: "rgba(0, 0, 0, 0.4)",
          borderRadius: "10px",
          padding: "16px",
          border: "1px solid var(--border-light)",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}>
          <div style={{ display: "flex", gap: "8px", color: "var(--color-warning)" }}>
            <AlertTriangle size={18} />
            <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>
              Are you absolutely sure you want to {isFrozen ? "unfreeze" : "freeze"} this agent?
            </span>
          </div>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
            {isFrozen
              ? "This will re-authorize the active VaultKey to immediately resume executing transactions according to policy limits."
              : "This will instantly invalidate all spend requests from the agent wallet on-chain until explicitly unfrozen."
            }
          </p>
          <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowConfirm(false)}
              disabled={loading}
              style={{ flex: 1 }}
            >
              Cancel
            </button>
            <button 
              className={isFrozen ? "btn btn-success" : "btn btn-danger"} 
              onClick={handleAction}
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? "Confirming..." : isFrozen ? "Confirm Resume" : "Confirm Freeze"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
