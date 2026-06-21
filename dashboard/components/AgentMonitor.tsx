"use client";

import { useEffect, useState } from "react";
import { Activity, Zap, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";

interface AgentEvent {
  id: string;
  timestamp: Date;
  type: "opportunity" | "approved" | "blocked" | "executed" | "error" | "info";
  title: string;
  description: string;
  data?: Record<string, any>;
}

interface AgentStats {
  opportunitiesFound: number;
  decisionsApproved: number;
  decisionsBlocked: number;
  transactionsExecuted: number;
  transactionsSimulated?: number;
  errors?: number;
  startedAt?: string | null;
  lastScanAt?: string | null;
  isActive: boolean;
  mode?: "dry-run" | "live";
  vaultId?: string | null;
  agentAddress?: string | null;
}

export function AgentMonitor() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [stats, setStats] = useState<AgentStats>({
    opportunitiesFound: 0,
    decisionsApproved: 0,
    decisionsBlocked: 0,
    transactionsExecuted: 0,
    isActive: false,
  });
  const [showReasoning, setShowReasoning] = useState<AgentEvent | null>(null);

  useEffect(() => {
    const pollAgentStatus = async () => {
      try {
        const res = await fetch("/api/active-agent");
        const data = await res.json();
        if (data.stats) {
          setStats(data.stats);
          if (data.recentEvents) {
            // Merge new server events with any local-only state, dedup by id,
            // then sort newest-first and cap at 20. Prevents the same event
            // from appearing twice when the API returns the same window twice.
            setEvents((prev) => {
              const incoming = data.recentEvents.map((e: any) => ({
                ...e,
                timestamp: new Date(e.timestamp),
              }));
              const map = new Map<string, AgentEvent>();
              for (const e of prev) map.set(e.id, e);
              for (const e of incoming) map.set(e.id, e);
              return [...map.values()]
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
                .slice(0, 20);
            });
          }
        }
      } catch (err) {
        console.error("Failed to poll agent status:", err);
      }
    };

    pollAgentStatus();
    const interval = setInterval(pollAgentStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const getIcon = (type: AgentEvent["type"]) => {
    switch (type) {
      case "opportunity":
        return <Zap size={18} className="text-yellow-400" />;
      case "approved":
        return <CheckCircle2 size={18} className="text-green-400" />;
      case "blocked":
        return <AlertCircle size={18} className="text-red-400" />;
      case "executed":
        return <TrendingUp size={18} className="text-blue-400" />;
      case "error":
        return <AlertCircle size={18} className="text-orange-400" />;
      case "info":
        return <Activity size={18} className="text-cyan-400" />;
    }
  };

  return (
    <div style={{ background: "rgba(30,106,255,0.05)", border: "1px solid rgba(30,106,255,0.2)", borderRadius: "12px", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
        <Activity size={20} color="#1e6aff" />
        <h3 style={{ color: "#fff", margin: 0, fontSize: "1.1rem" }}>
          Autonomous Agent Monitor
          {stats.isActive && (
            <span
              style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                background: "#10b981",
                borderRadius: "50%",
                marginLeft: "8px",
                animation: "pulse 2s infinite",
              }}
            />
          )}
        </h3>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "12px", marginBottom: "16px" }}>
        <div style={{ background: "rgba(59,130,246,0.1)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Found</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1e6aff" }}>{stats.opportunitiesFound}</div>
        </div>
        <div style={{ background: "rgba(16,185,129,0.1)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Approved</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#10b981" }}>{stats.decisionsApproved}</div>
        </div>
        <div style={{ background: "rgba(239,68,68,0.1)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Blocked</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#ef4444" }}>{stats.decisionsBlocked}</div>
        </div>
        <div style={{ background: "rgba(168,85,247,0.1)", padding: "12px", borderRadius: "8px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Executed</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#a855f7" }}>{stats.transactionsExecuted}</div>
        </div>
        {typeof stats.transactionsSimulated === "number" && (
          <div style={{ background: "rgba(99,102,241,0.1)", padding: "12px", borderRadius: "8px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Simulated</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#6366f1" }}>{stats.transactionsSimulated}</div>
          </div>
        )}
      </div>

      {stats.mode && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "12px" }}>
          Mode: <strong style={{ color: stats.mode === "live" ? "#10b981" : "#f59e0b" }}>{stats.mode}</strong>
          {stats.lastScanAt && (
            <> &middot; Last scan {new Date(stats.lastScanAt).toLocaleTimeString()}</>
          )}
        </div>
      )}

      {/* Recent Events */}
      <div>
        <h4 style={{ color: "var(--text-secondary)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "1px", margin: "0 0 8px" }}>
          Recent Activity
        </h4>
        <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          {events.length === 0 ? (
            <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem", padding: "16px", textAlign: "center" }}>
              Awaiting agent activity...
            </div>
          ) : (
            events.map((event) => (
              <button
                key={event.id}
                onClick={() => event.data && setShowReasoning(event)}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  padding: "12px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <div style={{ marginTop: "2px", flexShrink: 0 }}>{getIcon(event.type)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "0.85rem", color: "#fff", fontWeight: 600 }}>{event.title}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "2px" }}>{event.description}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                      {event.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Reasoning Modal */}
      {showReasoning && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowReasoning(null)}
        >
          <div
            style={{
              background: "#0f172a",
              border: "1px solid rgba(30,106,255,0.3)",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "600px",
              maxHeight: "80vh",
              overflowY: "auto",
              color: "#fff",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "1.2rem" }}>Agent Decision Reasoning</h3>
            <pre
              style={{
                background: "rgba(0,0,0,0.5)",
                padding: "12px",
                borderRadius: "8px",
                fontSize: "0.75rem",
                color: "#a3c4ff",
                overflow: "auto",
                maxHeight: "500px",
              }}
            >
              {JSON.stringify(showReasoning.data, null, 2)}
            </pre>
            <button
              onClick={() => setShowReasoning(null)}
              style={{
                marginTop: "16px",
                padding: "8px 16px",
                background: "rgba(30,106,255,0.2)",
                border: "1px solid rgba(30,106,255,0.4)",
                borderRadius: "6px",
                color: "#1e6aff",
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
