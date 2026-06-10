"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, CheckCircle2, Shield, Lock, ChevronRight, Globe, X } from "lucide-react";
import { useEnokiFlow } from "@mysten/enoki/react";

interface ZkLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  provider: "google" | "twitch";
  onSuccess: (session: any) => void;
}

export function ZkLoginModal({ isOpen, onClose, provider, onSuccess }: ZkLoginModalProps) {
  const enokiFlow = useEnokiFlow();
  const [loadingReal, setLoadingReal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);

  const providerName = provider === "google" ? "Google" : "Twitch";
  const providerColor = provider === "google" ? "#4285F4" : "#9146FF";

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setLoadingReal(false);
      setErrorMsg("");
    }
  }, [isOpen]);

  // Block body scroll while modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loadingReal) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, loadingReal, onClose]);

  // Click outside modal panel to close
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) && !loadingReal) {
        onClose();
      }
    },
    [onClose, loadingReal]
  );

  const handleRealLogin = async () => {
    setLoadingReal(true);
    setErrorMsg("");
    try {
      const clientId = provider === "google"
        ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
        : process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;

      if (!clientId) {
        throw new Error(
          `Missing ${provider === "google" ? "NEXT_PUBLIC_GOOGLE_CLIENT_ID" : "NEXT_PUBLIC_TWITCH_CLIENT_ID"}. Add the OAuth client ID from your Enoki provider setup to .env.local.`
        );
      }

      const redirectUrl = `${window.location.origin}${window.location.pathname}`;
      const authUrl = await enokiFlow.createAuthorizationURL({
        provider,
        clientId,
        redirectUrl,
        network: "testnet",
        extraParams: {
          scope: provider === "google" ? ["email", "profile"] : ["user:read:email"],
        },
      });

      window.location.assign(authUrl);
    } catch (err: any) {
      console.error("zkLogin OAuth redirect failed:", err);
      setErrorMsg(err.message || "Failed to launch authentication popup.");
      setLoadingReal(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2, 4, 10, 0.88)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflowY: "auto",
        zIndex: 9999,
        padding: "40px 20px",
        pointerEvents: "auto",
        animation: "zkFadeIn 0.2s ease-out",
      }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, #071126 0%, #030814 100%)",
          border: "1px solid rgba(30, 106, 255, 0.35)",
          boxShadow:
            "0 0 60px rgba(30, 106, 255, 0.12), 0 24px 48px rgba(0, 0, 0, 0.6)",
          width: "100%",
          maxWidth: "440px",
          borderRadius: "16px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          animation: "zkSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          pointerEvents: "auto",
          margin: "auto 0",
        }}
      >
        {/* ─── Header ─── */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                background: `linear-gradient(135deg, ${providerColor}22, ${providerColor}08)`,
                padding: "8px",
                borderRadius: "10px",
                border: `1px solid ${providerColor}33`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield size={20} color={providerColor} />
            </div>
            <div>
              <h3
                style={{
                  fontSize: "1.1rem",
                  fontWeight: 600,
                  color: "#fff",
                  margin: 0,
                }}
              >
                Sign in with {providerName}
              </h3>
              <p
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-muted)",
                  margin: 0,
                  marginTop: "2px",
                }}
              >
                Sui zkLogin • Zero-Knowledge Authentication
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loadingReal}
            aria-label="Close"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              color: "var(--text-muted)",
              cursor: loadingReal ? "not-allowed" : "pointer",
              padding: "5px",
              display: "flex",
              transition: "all 0.2s ease",
              opacity: loadingReal ? 0.4 : 1,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ─── Body ─── */}
        <div
          style={{
            padding: "28px 24px",
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {/* Explanation */}
          <p
            style={{
              fontSize: "0.88rem",
              color: "var(--text-secondary)",
              lineHeight: 1.55,
              margin: 0,
            }}
          >
            You will be redirected to{" "}
            <span style={{ color: providerColor, fontWeight: 500 }}>
              {providerName}
            </span>{" "}
            to sign in with your real account. A zero-knowledge proof will
            be generated to derive your Sui address — your credentials
            never touch the blockchain.
          </p>

          {/* Error Message */}
          {errorMsg && (
            <div
              style={{
                background: "rgba(239, 68, 68, 0.08)",
                border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: "10px",
                padding: "12px 14px",
                fontSize: "0.8rem",
                color: "#ef4444",
                lineHeight: 1.45,
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Primary CTA: Real OAuth Login */}
          <button
            onClick={handleRealLogin}
            disabled={loadingReal}
            style={{
              width: "100%",
              padding: "16px 20px",
              borderRadius: "12px",
              border: `1px solid ${providerColor}55`,
              background: `linear-gradient(135deg, ${providerColor}20, ${providerColor}08)`,
              cursor: loadingReal ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              transition: "all 0.25s ease",
              opacity: loadingReal ? 0.7 : 1,
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                background: `${providerColor}22`,
                border: `1px solid ${providerColor}33`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {loadingReal ? (
                <Loader2
                  size={20}
                  color={providerColor}
                  style={{ animation: "zkSpin 1.5s infinite linear" }}
                />
              ) : (
                <Globe size={20} color={providerColor} />
              )}
            </div>
            <div style={{ textAlign: "left", flex: 1 }}>
              <div
                style={{ fontSize: "0.95rem", fontWeight: 600, color: "#fff" }}
              >
                {loadingReal
                  ? "Redirecting to OAuth..."
                  : `Continue with ${providerName}`}
              </div>
              <div
                style={{
                  fontSize: "0.72rem",
                  color: "var(--text-secondary)",
                  marginTop: "2px",
                }}
              >
                {loadingReal
                  ? "Generating ephemeral keys & redirect URI..."
                  : "Real authentication via Mysten Labs Enoki"}
              </div>
            </div>
            {!loadingReal && (
              <ChevronRight size={18} color="var(--text-muted)" />
            )}
          </button>

          {/* How it works */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              padding: "14px 16px",
              borderRadius: "10px",
              background: "rgba(30, 106, 255, 0.03)",
              border: "1px solid rgba(30, 106, 255, 0.08)",
            }}
          >
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.8px",
              }}
            >
              How zkLogin works
            </span>
            {[
              { step: "1", text: "Generate ephemeral key pair locally" },
              { step: "2", text: `Authenticate with ${providerName} OAuth` },
              { step: "3", text: "Receive Groth16 zero-knowledge proof" },
              { step: "4", text: "Derive your unique Sui address on-chain" },
            ].map((item) => (
              <div
                key={item.step}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  fontSize: "0.78rem",
                  color: "var(--text-secondary)",
                }}
              >
                <div
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "6px",
                    background: "rgba(30, 106, 255, 0.1)",
                    border: "1px solid rgba(30, 106, 255, 0.2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.65rem",
                    fontWeight: 600,
                    color: "var(--color-primary)",
                    flexShrink: 0,
                  }}
                >
                  {item.step}
                </div>
                <span>{item.text}</span>
              </div>
            ))}
          </div>

          {/* Security note */}
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              padding: "12px 14px",
              borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.03)",
              border: "1px solid rgba(16, 185, 129, 0.1)",
            }}
          >
            <Lock
              size={14}
              color="#10b981"
              style={{ flexShrink: 0, marginTop: "2px" }}
            />
            <p
              style={{
                fontSize: "0.7rem",
                color: "var(--text-secondary)",
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              Your {providerName} password is never shared with SuiVault.
              Only a cryptographic proof of your identity is submitted
              on-chain via the Sui zkLogin protocol.
            </p>
          </div>
        </div>

        {/* ─── Footer with Cancel ─── */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid rgba(255, 255, 255, 0.05)",
            background: "rgba(0, 0, 0, 0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "0.68rem",
              color: "var(--text-muted)",
            }}
          >
            <Shield size={10} />
            Powered by Sui zkLogin Protocol
          </div>
          <button
            onClick={onClose}
            disabled={loadingReal}
            style={{
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "6px",
              color: loadingReal ? "var(--text-muted)" : "var(--text-secondary)",
              cursor: loadingReal ? "not-allowed" : "pointer",
              padding: "6px 14px",
              fontSize: "0.75rem",
              fontWeight: 500,
              transition: "all 0.2s ease",
              opacity: loadingReal ? 0.4 : 1,
            }}
          >
            Cancel
          </button>
        </div>
      </div>

      <style>{`
        @keyframes zkSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes zkFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes zkSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
