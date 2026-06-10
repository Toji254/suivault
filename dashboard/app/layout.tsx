"use client";

import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { EnokiFlowProvider } from "@mysten/enoki/react";
import { getFullnodeUrl } from "@mysten/sui/client";
import dynamic from "next/dynamic";
import { Navbar } from "../components/Navbar";
import "@mysten/dapp-kit/dist/index.css";
import "./globals.css";

const NeuralVaultMatrix = dynamic(
  () => import("../components/NeuralVaultMatrix"),
  { ssr: false }
);

const queryClient = new QueryClient();
const networks = {
  testnet: { url: getFullnodeUrl("testnet") },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" style={{ backgroundColor: "#02040A" }}>
      <head>
        <title>SuiVault Dashboard — On-Chain AI Agent Safeguards</title>
        <meta name="description" content="Secure spending limits, whitelists, and autonomous kill-switches for AI agents on Sui" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@200;300;400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body style={{ backgroundColor: "#02040A", color: "#F0F4FF", minHeight: "100vh" }}>
        <Suspense fallback={<div style={{ backgroundColor: "#02040A", minHeight: "100vh" }} />}>
          <QueryClientProvider client={queryClient}>
            <EnokiFlowProvider apiKey={process.env.NEXT_PUBLIC_ENOKI_API_KEY || "enoki_public_127a472fdf0025f94d6390e674801c74"}>
              <SuiClientProvider networks={networks} defaultNetwork="testnet">
                <WalletProvider autoConnect>
                  <NeuralVaultMatrix />
                  <div className="bg-ambient" />
                  <Navbar />
                  <main style={{ padding: "40px 4%", width: "100%", maxWidth: "none", margin: "0", position: "relative", zIndex: 1 }}>
                    {children}
                  </main>
                </WalletProvider>
              </SuiClientProvider>
            </EnokiFlowProvider>
          </QueryClientProvider>
        </Suspense>
      </body>
    </html>
  );
}
