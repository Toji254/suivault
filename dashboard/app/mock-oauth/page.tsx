"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Shield, Mail, Lock, CheckCircle2, ChevronRight, Zap } from "lucide-react";

export default function MockOAuth() {
  const searchParams = useSearchParams();
  const provider = searchParams.get("provider") || "google";
  const [customEmail, setCustomEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const providerName = provider === "google" ? "Google" : "Twitch";
  const providerColor = provider === "google" ? "#4285F4" : "#9146FF";

  const presetEmails = provider === "google" 
    ? ["cyrusmogen123@gmail.com", "hackathon-judge@gmail.com", "sui-developer@gmail.com"]
    : ["cyrus_streamer", "twitch_judge", "sui_overload_bot"];

  const handleLogin = (emailAddress: string) => {
    setLoading(true);
    
    // Derived address based on email string to make it deterministic
    let hash = 0;
    for (let i = 0; i < emailAddress.length; i++) {
      hash = emailAddress.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hex = Math.abs(hash).toString(16).padEnd(8, "0");
    const address = `0x142df8eaa1bfa7554bc9a71d9105f5a4b039e6${hex}`;

    setTimeout(() => {
      const session = {
        email: emailAddress,
        provider,
        address,
        isMock: true,
        loginTime: Date.now(),
        jwtExpiration: Math.floor(Date.now() / 1000) + 86400 * 7, // 7 days
      };

      localStorage.setItem("zklogin_user", JSON.stringify(session));
      // Dispatch event to sync other tabs/opener
      window.dispatchEvent(new Event("zklogin-auth-change"));
      
      setLoading(false);
      setDone(true);
      
      setTimeout(() => {
        window.close();
      }, 1000);
    }, 1500);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top, #0a192f 0%, #020813 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      color: "#e2e8f0"
    }}>
      <div style={{
        width: "100%",
        maxWidth: "420px",
        background: "rgba(10, 25, 47, 0.7)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${providerColor}40`,
        boxShadow: `0 0 40px ${providerColor}15, 0 16px 36px rgba(0,0,0,0.5)`,
        borderRadius: "16px",
        padding: "32px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        textAlign: "center"
      }}>
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <div style={{
            background: `${providerColor}15`,
            border: `1px solid ${providerColor}33`,
            width: "56px",
            height: "56px",
            borderRadius: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 20px ${providerColor}20`
          }}>
            <Shield size={28} color={providerColor} />
          </div>
          <div>
            <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0, color: "#fff" }}>
              zkLogin Sandbox Sign-In
            </h2>
            <p style={{ fontSize: "0.8rem", color: "#a3b3cc", margin: "4px 0 0 0" }}>
              Simulating Secure {providerName} OAuth Verification
            </p>
          </div>
        </div>

        {done ? (
          <div style={{
            padding: "40px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px"
          }}>
            <div style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              background: "rgba(16, 185, 129, 0.1)",
              border: "1px solid #10b981",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <CheckCircle2 size={24} color="#10b981" />
            </div>
            <div>
              <h4 style={{ margin: 0, color: "#fff", fontSize: "1rem" }}>Login Successful!</h4>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.78rem", color: "#a3b3cc" }}>
                Closing secure OAuth popup window...
              </p>
            </div>
          </div>
        ) : loading ? (
          <div style={{
            padding: "40px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "16px"
          }}>
            <div className="spinner" style={{
              width: "36px",
              height: "36px",
              border: `3px solid ${providerColor}20`,
              borderTop: `3px solid ${providerColor}`,
              borderRadius: "50%",
              animation: "spin 1s infinite linear"
            }}></div>
            <div>
              <h4 style={{ margin: 0, color: "#fff", fontSize: "1.05rem" }}>Generating ZK Proof</h4>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.75rem", color: "#a3b3cc", maxWidth: "240px", lineHeight: "1.4" }}>
                Creating Groth16 proof & deriving address on-chain...
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Presets */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{
                textAlign: "left",
                fontSize: "0.72rem",
                color: "#a3b3cc",
                textTransform: "uppercase",
                letterSpacing: "0.6px",
                fontWeight: 600
              }}>
                Choose a Demo Account
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {presetEmails.map((email) => (
                  <button
                    key={email}
                    onClick={() => handleLogin(email)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "12px 14px",
                      background: "rgba(255, 255, 255, 0.03)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "10px",
                      color: "#fff",
                      fontSize: "0.85rem",
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      textAlign: "left"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.07)";
                      e.currentTarget.style.border = `1px solid ${providerColor}60`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                      e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.08)";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <Mail size={16} color={providerColor} />
                      <span>{email}</span>
                    </div>
                    <ChevronRight size={14} color="#526685" />
                  </button>
                ))}
              </div>
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#526685",
              fontSize: "0.75rem",
              fontWeight: 500
            }}>
              <hr style={{ flex: 1, border: "none", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }} />
              <span>OR ENTER CUSTOM</span>
              <hr style={{ flex: 1, border: "none", borderTop: "1px solid rgba(255, 255, 255, 0.06)" }} />
            </div>

            {/* Custom Input */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input
                type="email"
                placeholder={provider === "google" ? "your-email@gmail.com" : "your_twitch_username"}
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  background: "rgba(0, 0, 0, 0.2)",
                  border: "1px solid rgba(255, 255, 255, 0.12)",
                  borderRadius: "10px",
                  color: "#fff",
                  fontSize: "0.9rem",
                  boxSizing: "border-box"
                }}
              />
              <button
                onClick={() => customEmail && handleLogin(customEmail)}
                disabled={!customEmail}
                style={{
                  width: "100%",
                  padding: "12px",
                  background: customEmail ? providerColor : "rgba(255, 255, 255, 0.05)",
                  color: customEmail ? "#fff" : "#526685",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: customEmail ? "pointer" : "not-allowed",
                  transition: "all 0.2s ease",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px"
                }}
              >
                <Zap size={16} />
                Sign In securely
              </button>
            </div>
          </>
        )}

        {/* Security Info */}
        <div style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          padding: "10px 12px",
          background: "rgba(16, 185, 129, 0.03)",
          border: "1px solid rgba(16, 185, 129, 0.1)",
          borderRadius: "8px",
          textAlign: "left"
        }}>
          <Lock size={12} color="#10b981" style={{ marginTop: "2px", flexShrink: 0 }} />
          <span style={{ fontSize: "0.68rem", color: "#a3b3cc", lineHeight: "1.4" }}>
            This is a mock OAuth portal for development and presentation. Credentials are simulated and never exposed.
          </span>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
