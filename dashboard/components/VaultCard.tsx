"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Shield, ShieldAlert, Cpu, Calendar, TrendingUp } from "lucide-react";
import { vaultClient } from "../lib/suivault";
import { mistToSui } from "../../sdk/client";
import type { Vault, VaultStats } from "../../sdk/types";

interface VaultCardProps {
  vault: Vault;
}

export function VaultCard({ vault }: VaultCardProps) {
  const [stats, setStats] = useState<VaultStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentName, setAgentName] = useState<string>("None");
  const [reputation, setReputation] = useState<number | null>(null);
  const isPendingLocal = vault.id.startsWith("pending-vault-") || vault.id.startsWith("local-vault-");

  useEffect(() => {
    async function loadStats() {
      if (isPendingLocal) {
        setStats(null);
        setAgentName("Syncing");
        setReputation(null);
        setLoading(false);
        return;
      }

      try {
        const data = await vaultClient.getVaultStats(vault.id);
        setStats(data);

        if (vault.agentKeyId) {
          if (vault.id.startsWith("demo-vault-")) {
            setAgentName(vault.id === "demo-vault-arbitrage" ? "DeFi Agent" : vault.id === "demo-vault-meme" ? "MEME Bot" : "Liquidator Bot");
            setReputation(vault.id === "demo-vault-arbitrage" ? 48 : vault.id === "demo-vault-meme" ? 12 : 0);
          } else {
            try {
              const key = await vaultClient.getVaultKey(vault.agentKeyId);
              if (key) {
                setAgentName(key.agentName);
                setReputation(key.reputationScore);
              }
            } catch (e) {
              console.error("Failed to load key inside VaultCard:", e);
            }
          }
        } else {
          setAgentName("None");
          setReputation(null);
        }
      } catch (e) {
        console.error("Failed to load vault stats:", e);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
    
    // Auto-refresh stats every 10 seconds
    const interval = setInterval(loadStats, 10000);
    return () => clearInterval(interval);
  }, [vault.id, vault.agentKeyId, isPendingLocal]);

  const maxPerDaySui = Number(vault.policy.maxPerDay) / 1_000_000_000;
  const todaySpentSui = Number(vault.todaySpent) / 1_000_000_000;
  
  // Format expiry string
  const formatExpiry = () => {
    if (!stats || stats.keyExpiryMs === null) return "No Key Issued";
    if (stats.keyExpiryMs === 0) return "Key Expired";
    const minutes = Math.floor(stats.keyExpiryMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h remaining`;
    if (hours > 0) return `${hours}h ${minutes % 60}m remaining`;
    return `${minutes}m remaining`;
  };

  const pct = stats?.utilizationPercent ?? 0;
  const progressColorClass = pct > 85 ? "progress-fill-danger" : pct > 50 ? "progress-fill-warning" : "progress-fill";

  return (
    <div className={`glass-panel ${vault.isFrozen ? "" : "glow-active"}`} style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      position: "relative",
      minHeight: "360px",
    }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 600, color: "#fff", marginBottom: "4px" }}>
            {vault.name}
          </h3>
          <span className="font-mono" style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            {vault.id.substring(0, 10)}...{vault.id.substring(vault.id.length - 8)}
          </span>
        </div>

        {isPendingLocal ? (
          <span className="badge badge-warning">
            <Calendar size={12} />
            Syncing
          </span>
        ) : vault.isFrozen ? (
          <span className="badge badge-danger">
            <ShieldAlert size={12} />
            Frozen
          </span>
        ) : (
          <span className="badge badge-success">
            <Shield size={12} />
            Active
          </span>
        )}
      </div>

      {/* Balance */}
      <div style={{ margin: "10px 0" }}>
        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginBottom: "4px" }}>
          Vault Balance
        </span>
        <span style={{ fontSize: "2rem", fontWeight: 700, color: "#fff", lineHeight: 1 }}>
          {mistToSui(vault.balance)} <span style={{ fontSize: "1rem", color: "var(--color-primary)" }}>SUI</span>
        </span>
      </div>

      {/* Daily spending progress */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
            <TrendingUp size={14} />
            Daily Spending
          </span>
          <span className="font-mono" style={{ color: "#fff", fontWeight: 500 }}>
            {todaySpentSui.toFixed(2)} / {maxPerDaySui > 0 ? `${maxPerDaySui.toFixed(2)} SUI` : "∞"}
          </span>
        </div>
        <div className="progress-container">
          <div className={`progress-fill ${progressColorClass}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", alignSelf: "flex-end" }}>
          {pct}% budget utilized
        </span>
      </div>

      {/* Key Info */}
      <div style={{
        background: "rgba(0, 0, 0, 0.2)",
        borderRadius: "10px",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        fontSize: "0.85rem",
        border: "1px solid var(--border-light)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Cpu size={14} />
            Active Agent
          </span>
          <span style={{ color: "#fff", fontWeight: 500 }}>
            {agentName} {reputation !== null ? `🏆 ${reputation}` : ""}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
            <Calendar size={14} />
            Key Validity
          </span>
          <span style={{ color: stats?.keyExpiryMs === 0 ? "var(--color-danger)" : "#fff" }}>
            {loading ? "..." : formatExpiry()}
          </span>
        </div>
      </div>

      {/* Actions */}
      {isPendingLocal ? (
        <button className="btn btn-secondary" disabled style={{ marginTop: "auto", width: "100%", opacity: 0.65, cursor: "not-allowed" }}>
          Waiting for On-Chain Sync
        </button>
      ) : (
        <Link href={`/vault/${vault.id}`} className="btn btn-primary" style={{ marginTop: "auto", width: "100%" }}>
          Manage Settings
        </Link>
      )}
    </div>
  );
}
