"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, KeyRound, Loader2, Shield, Wallet, AlertTriangle } from "lucide-react";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";

type Provider = "google" | "twitch";

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "google") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    );
  }

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#9146FF">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
    </svg>
  );
}

export default function AuthPage() {
  const searchParams = useSearchParams();
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const requestedProvider = searchParams.get("provider") === "twitch" ? "twitch" : "google";
  const [provider, setProvider] = useState<Provider>(requestedProvider);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const providerName = provider === "google" ? "Google" : "Twitch";
  const providerColor = provider === "google" ? "#4285F4" : "#9146FF";
  const clientId = provider === "google"
    ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    : process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
  const missingEnv = provider === "google" ? "NEXT_PUBLIC_GOOGLE_CLIENT_ID" : "NEXT_PUBLIC_TWITCH_CLIENT_ID";

  const startLogin = async () => {
    setErrorMsg("");
    if (!clientId) {
      setErrorMsg(`Missing ${missingEnv}. Add it to dashboard/.env.local and restart the dev server.`);
      return;
    }

    setLoading(true);
    try {
      const authUrl = await enokiFlow.createAuthorizationURL({
        provider,
        clientId,
        redirectUrl: `${window.location.origin}/auth?provider=${provider}`,
        network: "testnet",
        extraParams: {
          scope: provider === "google" ? ["email", "profile"] : ["user:read:email"],
        },
      });
      window.location.assign(authUrl);
    } catch (err: any) {
      setErrorMsg(err.message || "Could not start zkLogin.");
      setLoading(false);
    }
  };

  return (
    <section className="auth-section">
      <div className="auth-shell">
        <div className="glass-panel" style={{ padding: "34px", borderRadius: "12px", border: "1px solid rgba(30,106,255,0.22)" }}>
          <Link href="/" style={{ color: "var(--text-secondary)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "8px", fontSize: "0.86rem", marginBottom: "34px" }}>
            <ArrowLeft size={16} />
            Back to vault console
          </Link>

          <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", color: "#a3c4ff", fontFamily: "'Space Grotesk', monospace", fontSize: "0.76rem", letterSpacing: "2px", textTransform: "uppercase", marginBottom: "18px" }}>
            <Shield size={16} color={providerColor} />
            Real Sui zkLogin
          </div>

          <h1 style={{ color: "#fff", fontSize: "clamp(2.2rem, 5vw, 4rem)", lineHeight: 1.02, margin: "0 0 18px" }}>
            Sign in with {providerName}
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "1rem", lineHeight: 1.7, maxWidth: "620px", margin: "0 0 30px" }}>
            This starts the real OAuth flow through Mysten Enoki. Your provider account proves identity, Enoki derives your Sui zkLogin address, and SuiVault uses that address to load real vaults from testnet.
          </p>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "28px" }}>
            {(["google", "twitch"] as Provider[]).map((item) => (
              <button
                key={item}
                onClick={() => {
                  setProvider(item);
                  setErrorMsg("");
                }}
                style={{
                  height: "42px",
                  borderRadius: "8px",
                  border: item === provider ? `1px solid ${item === "google" ? "#4285F4" : "#9146FF"}` : "1px solid rgba(255,255,255,0.08)",
                  background: item === provider ? `${item === "google" ? "#4285F4" : "#9146FF"}18` : "rgba(255,255,255,0.03)",
                  color: "#fff",
                  padding: "0 16px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  cursor: "pointer",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                <ProviderIcon provider={item} />
                {item === "google" ? "Google" : "Twitch"}
              </button>
            ))}
          </div>

          {zkLogin.address ? (
            <div style={{ border: "1px solid rgba(16,185,129,0.24)", background: "rgba(16,185,129,0.06)", borderRadius: "12px", padding: "18px", color: "#d1fae5", display: "flex", gap: "12px", alignItems: "flex-start" }}>
              <CheckCircle2 size={20} color="#10b981" />
              <div>
                <strong style={{ color: "#fff" }}>zkLogin connected</strong>
                <div className="font-mono" style={{ marginTop: "4px", color: "#a7f3d0", fontSize: "0.85rem", wordBreak: "break-all" }}>{zkLogin.address}</div>
              </div>
            </div>
          ) : (
            <button
              onClick={startLogin}
              disabled={loading}
              style={{
                width: "100%",
                maxWidth: "460px",
                height: "58px",
                borderRadius: "10px",
                border: `1px solid ${providerColor}55`,
                background: `linear-gradient(135deg, ${providerColor}28, ${providerColor}10)`,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 18px",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                fontWeight: 700,
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {loading ? <Loader2 size={20} className="auth-spinner" /> : <ProviderIcon provider={provider} />}
                {loading ? "Opening OAuth..." : `Continue with ${providerName}`}
              </span>
              <ChevronRight size={20} />
            </button>
          )}

          {errorMsg && (
            <div style={{ marginTop: "18px", border: "1px solid rgba(245,158,11,0.25)", background: "rgba(245,158,11,0.08)", borderRadius: "10px", padding: "14px", color: "#fbbf24", display: "flex", gap: "10px", alignItems: "flex-start", fontSize: "0.88rem" }}>
              <AlertTriangle size={18} />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <aside className="glass-panel" style={{ padding: "28px", borderRadius: "12px", display: "flex", flexDirection: "column", gap: "18px", alignSelf: "stretch" }}>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "rgba(30,106,255,0.12)", border: "1px solid rgba(30,106,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <KeyRound size={22} color="#1e6aff" />
          </div>
          <h2 style={{ color: "#fff", margin: 0, fontSize: "1.35rem" }}>Provider setup</h2>
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.9rem", lineHeight: 1.6 }}>
            Real zkLogin needs a client ID from the OAuth provider registered in your Enoki project.
          </p>

          <div style={{ background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "10px", padding: "14px", display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ color: clientId ? "#10b981" : "#f59e0b", fontSize: "0.8rem", fontWeight: 700 }}>
              {clientId ? "Configured" : "Missing"}
            </span>
            <code style={{ color: "#a3c4ff", fontSize: "0.8rem", wordBreak: "break-all" }}>{missingEnv}</code>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", color: "var(--text-secondary)", fontSize: "0.82rem", lineHeight: 1.55 }}>
            <div style={{ display: "flex", gap: "8px" }}><span style={{ color: "#1e6aff" }}>1.</span><span>Create/configure the {providerName} OAuth app in Enoki.</span></div>
            <div style={{ display: "flex", gap: "8px" }}><span style={{ color: "#1e6aff" }}>2.</span><span>Add the callback URL: <code className="font-mono" style={{ color: "#fff" }}>http://localhost:3000/auth?provider={provider}</code></span></div>
            <div style={{ display: "flex", gap: "8px" }}><span style={{ color: "#1e6aff" }}>3.</span><span>Put the client ID in <code className="font-mono" style={{ color: "#fff" }}>dashboard/.env.local</code>, then restart Next.</span></div>
          </div>

          <Link href="/" className="btn btn-secondary" style={{ marginTop: "auto", display: "inline-flex", justifyContent: "center", gap: "8px" }}>
            <Wallet size={16} />
            Use Wallet Instead
          </Link>
        </aside>
      </div>

    </section>
  );
}
