"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

interface LiveTradeRecord {
  kind: string;
  strategy?: string;
  label?: string;
  market?: string;
  side?: string;
  status?: string;
  amountSui?: number;
  realizedPnlSui?: number | null;
  pnlStatus?: string;
  digest?: string | null;
  explorerUrl?: string | null;
  timestamp?: string;
}

function formatPnl(record: LiveTradeRecord) {
  if (typeof record.realizedPnlSui === "number") {
    const sign = record.realizedPnlSui > 0 ? "+" : "";
    return `${sign}${record.realizedPnlSui.toFixed(6)} SUI`;
  }
  if (record.status === "filled") return "Open / pending close";
  if (record.status === "blocked") return "No PnL — blocked";
  if (record.status === "not_submitted") return "No PnL — not traded";
  return "Pending real fill data";
}

function pnlColor(record: LiveTradeRecord) {
  if (typeof record.realizedPnlSui !== "number") return "var(--text-secondary)";
  if (record.realizedPnlSui > 0) return "var(--color-success)";
  if (record.realizedPnlSui < 0) return "var(--color-danger)";
  return "var(--text-secondary)";
}

export function ActiveAgentLiveFeed() {
  const [activity, setActivity] = useState<LiveTradeRecord[]>([]);
  const [lastRanAt, setLastRanAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setError("");
      const res = await fetch("/api/active-agent", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load active agent feed");
      setActivity(Array.isArray(data.activity) ? data.activity : []);
      setLastRanAt(data.lastRanAt || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load active agent feed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, []);

  const totals = useMemo(() => {
    return activity.reduce(
      (acc, record) => {
        if (record.kind === "real_trade_executed") acc.trades += 1;
        if (record.status === "blocked") acc.blocked += 1;
        if (typeof record.realizedPnlSui === "number") acc.pnl += record.realizedPnlSui;
        return acc;
      },
      { trades: 0, blocked: 0, pnl: 0 },
    );
  }, [activity]);

  return (
    <div className="glass-panel" style={{ display: "flex", flexDirection: "column", gap: "16px", border: "1px solid rgba(30, 106, 255, 0.22)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h3 style={{ fontSize: "1.05rem", fontWeight: 600, color: "#fff", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
            <Activity size={18} color="var(--color-primary)" />
            Live Agent Trades & PnL
          </h3>
          <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: "0.76rem", lineHeight: 1.45 }}>
            Polls the real active-agent run log every 4s. PnL is only shown when a real fill/close value exists; unknown values stay marked pending instead of being invented.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={load} style={{ padding: "7px 10px", fontSize: "0.78rem" }}>
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
        <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "9px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Real Trades</span>
          <div style={{ color: "#fff", fontWeight: 700 }}>{totals.trades}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "9px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Blocked</span>
          <div style={{ color: "var(--color-warning)", fontWeight: 700 }}>{totals.blocked}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.025)", border: "1px solid var(--border-light)", borderRadius: "8px", padding: "9px" }}>
          <span style={{ color: "var(--text-muted)", fontSize: "0.68rem" }}>Realized PnL</span>
          <div style={{ color: totals.pnl >= 0 ? "var(--color-success)" : "var(--color-danger)", fontWeight: 700 }}>
            {totals.pnl >= 0 ? "+" : ""}{totals.pnl.toFixed(6)} SUI
          </div>
        </div>
      </div>

      {lastRanAt && <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>Last agent tick: {new Date(lastRanAt).toLocaleString()}</span>}
      {error && <div style={{ color: "var(--color-danger)", fontSize: "0.78rem" }}>{error}</div>}
      {loading ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>Loading live feed...</div>
      ) : activity.length === 0 ? (
        <div style={{ color: "var(--text-muted)", fontSize: "0.82rem" }}>No active-agent records yet. Start the agent runner to stream real trade activity here.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "320px", overflowY: "auto" }}>
          {activity.map((record, index) => {
            const pnl = formatPnl(record);
            const isPositive = typeof record.realizedPnlSui === "number" && record.realizedPnlSui >= 0;
            return (
              <div key={`${record.digest || record.timestamp || index}-${index}`} style={{ border: "1px solid var(--border-light)", borderRadius: "10px", padding: "10px", background: "rgba(0,0,0,0.16)", display: "flex", flexDirection: "column", gap: "7px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: "0.86rem" }}>{record.strategy || "agent"} · {record.market || "market pending"}</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{record.side || "intent"} · {record.status || record.kind}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", color: pnlColor(record), fontWeight: 700, fontSize: "0.8rem" }}>
                    {isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {pnl}
                  </div>
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "0.74rem", lineHeight: 1.4 }}>{record.label}</div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "center", color: "var(--text-muted)", fontSize: "0.68rem" }}>
                  <span>{record.amountSui ?? 0} SUI · {record.timestamp ? new Date(record.timestamp).toLocaleTimeString() : "time pending"}</span>
                  {record.explorerUrl && (
                    <a href={record.explorerUrl} target="_blank" rel="noreferrer" style={{ color: "var(--color-primary)", display: "flex", alignItems: "center", gap: "4px" }}>
                      TX <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
