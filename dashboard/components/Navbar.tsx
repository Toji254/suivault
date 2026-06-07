"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@mysten/dapp-kit";
import { Shield, Wallet, ShieldAlert, Cpu, LogOut, History, ExternalLink, Copy, Check, Trash2, Clock, Sparkles } from "lucide-react";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { ZkLoginModal } from "./ZkLoginModal";

function RecentTxDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [txs, setTxs] = useState<any[]>([]);
  const [copiedDigest, setCopiedDigest] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadTxs = () => {
    try {
      const stored = localStorage.getItem("recent_transactions");
      if (stored) {
        setTxs(JSON.parse(stored));
      } else {
        setTxs([]);
      }
    } catch (e) {
      setTxs([]);
    }
  };

  useEffect(() => {
    loadTxs();
    window.addEventListener("recent-tx-update", loadTxs);
    
    // Close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("recent-tx-update", loadTxs);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCopy = (digest: string) => {
    navigator.clipboard.writeText(digest);
    setCopiedDigest(digest);
    setTimeout(() => setCopiedDigest(null), 2000);
  };

  const handleClear = () => {
    localStorage.removeItem("recent_transactions");
    setTxs([]);
    window.dispatchEvent(new Event("recent-tx-update"));
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Aesthetic Sui themed button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="sui-history-btn"
        style={{
          padding: "7px 14px",
          fontSize: "0.8rem",
          height: "36px",
          borderRadius: "8px",
          background: "linear-gradient(135deg, rgba(30, 106, 255, 0.12) 0%, rgba(30, 106, 255, 0.04) 100%)",
          border: "1px solid rgba(30, 106, 255, 0.25)",
          color: "#a3c4ff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 500,
          transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: isOpen ? "0 0 16px rgba(30, 106, 255, 0.25)" : "none",
        }}
      >
        <History size={15} style={{ animation: isOpen ? "none" : "pulse-glow 3s infinite" }} />
        <span>Activity</span>
        {txs.length > 0 && (
          <span style={{
            background: "#1e6aff",
            color: "#fff",
            fontSize: "0.68rem",
            fontWeight: 700,
            borderRadius: "50%",
            width: "18px",
            height: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 8px rgba(30, 106, 255, 0.6)",
          }}>
            {txs.length}
          </span>
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "42px",
            width: "320px",
            background: "linear-gradient(180deg, #071126 0%, #030814 100%)",
            border: "1px solid rgba(30, 106, 255, 0.3)",
            boxShadow: "0 12px 40px rgba(0, 0, 0, 0.75), 0 0 30px rgba(30, 106, 255, 0.1)",
            borderRadius: "12px",
            padding: "16px",
            zIndex: 1000,
            animation: "navSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "10px" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock size={13} color="#1e6aff" /> Recent Transactions
            </span>
            {txs.length > 0 && (
              <button
                onClick={handleClear}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                <Trash2 size={12} /> Clear
              </button>
            )}
          </div>

          {/* List items */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "260px", overflowY: "auto", paddingRight: "2px" }}>
            {txs.length === 0 ? (
              <div style={{ padding: "30px 10px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                No transactions recorded in this session.
              </div>
            ) : (
              txs.map((tx: any) => (
                <div
                  key={tx.digest}
                  style={{
                    padding: "10px 12px",
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid rgba(255,255,255,0.03)",
                    borderRadius: "8px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ fontSize: "0.82rem", fontWeight: 500, color: "#fff" }}>
                      {tx.description}
                    </span>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
                      {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(30,106,255,0.04)", padding: "4px 8px", borderRadius: "4px", border: "1px solid rgba(30,106,255,0.08)" }}>
                    <span style={{ fontSize: "0.72rem", fontFamily: "monospace", color: "#a3c4ff" }}>
                      {tx.digest.substring(0, 8)}...{tx.digest.substring(tx.digest.length - 8)}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <button
                        onClick={() => handleCopy(tx.digest)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: copiedDigest === tx.digest ? "#10b981" : "var(--text-muted)",
                          cursor: "pointer",
                          padding: "2px",
                          display: "flex",
                          alignItems: "center",
                          transition: "color 0.2s"
                        }}
                        title="Copy Tx Hash"
                      >
                        {copiedDigest === tx.digest ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                      <a
                        href={`https://suiscan.xyz/testnet/tx/${tx.digest}`}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: "var(--text-muted)",
                          display: "flex",
                          alignItems: "center",
                          padding: "2px",
                          transition: "color 0.2s"
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#1e6aff")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                        title="View on Suiscan"
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <style>{`
        .sui-history-btn:hover {
          background: linear-gradient(135deg, rgba(30, 106, 255, 0.2) 0%, rgba(30, 106, 255, 0.08) 100%) !important;
          border-color: rgba(30, 106, 255, 0.45) !important;
          box-shadow: 0 0 14px rgba(30, 106, 255, 0.15);
          transform: translateY(-1px);
        }
        .sui-history-btn:active {
          transform: translateY(0px);
        }
        @keyframes navSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; filter: drop-shadow(0 0 3px rgba(30,106,255,0.8)); }
        }
      `}</style>
    </div>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const [zkUser, setZkUser] = useState<any>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [provider, setProvider] = useState<"google" | "twitch">("google");

  useEffect(() => {
    // Automatically handle OIDC redirect callbacks if present in hash
    if (typeof window !== "undefined" && window.location.hash) {
      const hash = window.location.hash;
      if (hash.includes("id_token=")) {
        enokiFlow.handleAuthCallback(hash)
          .then(() => {
            window.location.hash = "";
          })
          .catch((err: any) => {
            console.error("Enoki redirect callback error:", err);
          });
      }
    }
  }, [enokiFlow]);

  useEffect(() => {
    if (zkLogin.address) {
      let email = "enoki-connected@gmail.com";
      try {
        const decoded = (enokiFlow as any).getDecodedIdToken();
        if (decoded && decoded.email) {
          email = decoded.email;
        }
      } catch (e) {
        console.error("Failed to decode Enoki ID token:", e);
      }

      const zkSession = {
        email,
        provider: zkLogin.provider || "google",
        address: zkLogin.address,
        isMock: false
      };
      localStorage.setItem("zklogin_user", JSON.stringify(zkSession));
      window.dispatchEvent(new Event("zklogin-auth-change"));
    }
  }, [zkLogin.address, zkLogin.provider, enokiFlow]);

  useEffect(() => {
    const handleAuthChange = () => {
      const stored = localStorage.getItem("zklogin_user");
      if (stored) {
        setZkUser(JSON.parse(stored));
      } else {
        setZkUser(null);
      }
    };

    handleAuthChange();
    window.addEventListener("zklogin-auth-change", handleAuthChange);
    return () => {
      window.removeEventListener("zklogin-auth-change", handleAuthChange);
    };
  }, []);

  const openZkModal = (prov: "google" | "twitch") => {
    setProvider(prov);
    setModalOpen(true);
  };

  const handleSuccess = (session: any) => {
    localStorage.setItem("zklogin_user", JSON.stringify(session));
    window.dispatchEvent(new Event("zklogin-auth-change"));
    setModalOpen(false);
  };

  const handleZkLogout = () => {
    localStorage.removeItem("zklogin_user");
    enokiFlow.logout();
    window.dispatchEvent(new Event("zklogin-auth-change"));
  };

  const navLinks = [
    { href: "/", label: "Vaults", icon: Wallet },
    { href: "/create", label: "Create Vault", icon: ShieldAlert },
    { href: "/agent", label: "Agent Keys", icon: Cpu },
    { href: "/welcome", label: "Showcase", icon: Sparkles },
  ];

  return (
    <nav className="navbar-container" style={{ borderRadius: "0 0 16px 16px", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
      {/* Logo */}
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
        <div style={{
          background: "linear-gradient(135deg, #1e6aff 0%, #0047cc 100%)",
          width: "36px",
          height: "36px",
          borderRadius: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 12px rgba(30, 106, 255, 0.3)",
        }}>
          <Shield size={20} color="#fff" />
        </div>
        <span style={{
          fontSize: "1.35rem",
          fontWeight: 500,
          fontFamily: "'Space Grotesk', sans-serif",
          letterSpacing: "-0.5px",
          background: "linear-gradient(90deg, #fff 0%, #a3c4ff 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          SuiVault
        </span>
      </Link>

      {/* Navigation Links */}
      <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
        {navLinks.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} style={{
            color: pathname === href ? "#1e6aff" : "#A3B3CC",
            textDecoration: "none",
            fontWeight: 400,
            fontSize: "0.95rem",
            fontFamily: "'Space Grotesk', monospace",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            transition: "color 0.2s ease",
          }}>
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </div>

      {/* Auth Section */}
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <RecentTxDropdown />
        {zkUser ? (
          /* Authenticated State */
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "0",
            borderRadius: "10px",
            overflow: "hidden",
            border: "1px solid rgba(30, 106, 255, 0.2)",
          }}>
            {/* User Info Pill */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 14px",
              background: "rgba(30, 106, 255, 0.06)",
              fontSize: "0.82rem",
              color: "#a3c4ff",
              fontFamily: "'Space Grotesk', monospace",
            }}>
              <div style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#10b981",
                boxShadow: "0 0 6px rgba(16, 185, 129, 0.5)",
              }} />
              <span style={{ color: "#fff", fontWeight: 500 }}>
                {zkUser.provider === "google" ? "G" : "T"}
              </span>
              <span style={{ maxWidth: "140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {zkUser.email || zkUser.address?.substring(0, 10) + "..."}
              </span>
            </div>
            {/* Disconnect Button */}
            <button
              onClick={handleZkLogout}
              style={{
                background: "rgba(239, 68, 68, 0.06)",
                border: "none",
                borderLeft: "1px solid rgba(255,255,255,0.06)",
                color: "#ef4444",
                cursor: "pointer",
                padding: "8px 10px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "0.75rem",
                transition: "all 0.2s ease"
              }}
              title="Disconnect zkLogin"
            >
              <LogOut size={12} />
            </button>
          </div>
        ) : (
          /* Login Buttons */
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <button
              onClick={() => openZkModal("google")}
              style={{
                padding: "7px 14px",
                fontSize: "0.8rem",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(66, 133, 244, 0.08)",
                border: "1px solid rgba(66, 133, 244, 0.2)",
                color: "#a3c4ff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                transition: "all 0.2s ease",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button
              onClick={() => openZkModal("twitch")}
              style={{
                padding: "7px 14px",
                fontSize: "0.8rem",
                height: "36px",
                borderRadius: "8px",
                background: "rgba(145, 70, 255, 0.08)",
                border: "1px solid rgba(145, 70, 255, 0.2)",
                color: "#c4a3ff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                transition: "all 0.2s ease",
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#9146FF">
                <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
              </svg>
              Twitch
            </button>
          </div>
        )}
        
        {!zkUser && <ConnectButton className="sui-connect-btn" />}
      </div>

      <ZkLoginModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        provider={provider} 
        onSuccess={handleSuccess} 
      />
    </nav>
  );
}
