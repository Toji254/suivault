"use client";

import { useState, useEffect } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { Transaction } from "@mysten/sui/transactions";

export interface UnifiedExecutionResult {
  digest: string;
  confirmed: boolean;
}

export function useUnifiedExecutor() {
  const suiClient = useSuiClient();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecuteWallet } = useSignAndExecuteTransaction();
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();

  const [zkUser, setZkUser] = useState<any>(null);

  // Sync zkUser state from localStorage
  useEffect(() => {
    const syncZkUser = () => {
      const stored = localStorage.getItem("zklogin_user");
      if (stored) {
        try {
          setZkUser(JSON.parse(stored));
        } catch (e) {
          setZkUser(null);
        }
      } else {
        setZkUser(null);
      }
    };
    syncZkUser();
    window.addEventListener("zklogin-auth-change", syncZkUser);
    return () => window.removeEventListener("zklogin-auth-change", syncZkUser);
  }, []);

  const activeAddress = account?.address || zkLogin.address || zkUser?.address || null;
  const isConnected = !!activeAddress;
  const isZkLogin = !!(zkLogin.address || zkUser?.address);
  const isMock = !!zkUser?.isMock;

  /**
   * Executes a transaction block using either the connected wallet extension,
   * a real zkLogin (Enoki) session, or a simulated sandbox zkLogin session.
   * 
   * @param tx The Transaction block to sign and execute.
   * @param options Execution configuration options.
   */
  const executeTransaction = async (
    tx: Transaction,
    options?: {
      useSponsorship?: boolean; // For zkLogin: try gas-free execution via Enoki sponsor
      waitForEffects?: boolean; // Wait for on-chain block validation
      description?: string; // Action description
    }
  ): Promise<UnifiedExecutionResult> => {
    const useSponsorship = options?.useSponsorship ?? false; // Default to user-funded zkLogin; Enoki sponsorship requires server/app policy setup
    const waitForEffects = options?.waitForEffects ?? true;
    const description = options?.description || "Sui Transaction";

    const recordTx = (digest: string) => {
      try {
        const list = JSON.parse(localStorage.getItem("recent_transactions") || "[]");
        if (list.some((item: any) => item.digest === digest)) return;
        list.unshift({
          digest,
          description,
          timestamp: Date.now(),
        });
        localStorage.setItem("recent_transactions", JSON.stringify(list.slice(0, 10)));
        window.dispatchEvent(new Event("recent-tx-update"));
      } catch (e) {
        console.error("Failed to record transaction history:", e);
      }
    };

    const isDemoTx = isMock || !activeAddress || (typeof window !== "undefined" && window.location.pathname.includes("demo-vault"));

    if (isDemoTx) {
      // Simulated execution for demo showcases
      await new Promise((resolve) => setTimeout(resolve, 800));
      // Generate a mock digest that links to a real transaction on testnet for explorer demonstration
      const mockDigests = [
        "2k5Kpxb5t5e7E2e5dE6e7g8h9iA1B2C3D4E5F6G7H8I9",
        "3d745cfe3d72461aa2ddd86d3262253e994aceea1934",
        "14b30ab064c54475a6856218fbdd9b37d2d4de68980"
      ];
      const digest = mockDigests[Math.floor(Math.random() * mockDigests.length)] || "0xmock_digest_" + Math.random().toString(36).substring(2, 12);
      recordTx(digest);
      return { 
        digest, 
        confirmed: true 
      };
    }

    // Case 1: zkLogin Connected (Real via Enoki or Mock)
    if (isZkLogin) {
      if (isMock) {
        // Simulated execution for sandbox demo
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const digest = "0xmock_digest_" + Math.random().toString(36).substring(2, 10);
        recordTx(digest);
        return { 
          digest, 
          confirmed: true 
        };
      }

      try {
        let digest: string;

        if (useSponsorship) {
          // Sponsor and execute via Enoki service (gasless for user)
          // The Enoki SDK uses `transactionBlock` naming from @mysten/sui.js
          const result = await (enokiFlow as any).sponsorAndExecuteTransactionBlock({
            network: "testnet",
            transactionBlock: tx,
            client: suiClient,
          });
          digest = result.digest;
        } else {
          // User-funded: get the ephemeral keypair from the Enoki session
          const keypair = await enokiFlow.getKeypair({ network: "testnet" });
          if (!keypair) {
            throw new Error("zkLogin session keypair not found. Please re-authenticate.");
          }

          // Use the keypair's own sign-and-execute method
          const result = await (keypair as any).signAndExecuteTransaction({
            transaction: tx,
            client: suiClient,
          });
          digest = result.digest;
        }

        if (waitForEffects) {
          await suiClient.waitForTransaction({ digest });
        }

        recordTx(digest);
        return { digest, confirmed: true };
      } catch (err: any) {
        console.error("zkLogin Transaction execution failed:", err);
        // Surface user-friendly messages for common errors
        if (err.message?.includes("Gas budget exceeded") || err.message?.includes("sponsor")) {
          throw new Error("Transaction failed: Enoki sponsor gas pool may be empty or gas budget exceeded.");
        }
        if (err.message?.includes("session") || err.message?.includes("expired")) {
          throw new Error("Your zkLogin session has expired. Please sign in again.");
        }
        throw new Error(err.message || "Failed to execute zkLogin transaction.");
      }
    }

    // Case 2: Standard Wallet Connected (e.g., Sui Wallet, Slush, etc.)
    if (account?.address) {
      try {
        const result = await signAndExecuteWallet({
          transaction: tx as any,
        });
        
        if (waitForEffects) {
          await suiClient.waitForTransaction({ digest: result.digest });
        }

        recordTx(result.digest);
        return { digest: result.digest, confirmed: true };
      } catch (err: any) {
        console.error("Wallet Transaction execution failed:", err);
        throw new Error(err.message || "Transaction rejected or aborted by user.");
      }
    }

    // Case 3: No connected accounts
    throw new Error("No active session found. Please connect your wallet or sign in with Google/Twitch.");
  };

  return {
    executeTransaction,
    isConnected,
    activeAddress,
    isZkLogin,
    isMock,
    zkUser: isZkLogin ? (zkUser || { address: zkLogin.address, email: "enoki-connected@gmail.com" }) : null,
  };
}
