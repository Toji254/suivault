"use client";

import { useState, useEffect, useCallback } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { Transaction } from "@mysten/sui/transactions";

const TX_CONFIRMATION_TIMEOUT_MS = 60_000;

export interface UnifiedExecutionResult {
  digest: string;
  confirmed: boolean;
}

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve/reject
 * within `ms` milliseconds, it rejects with a timeout error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. The transaction may still be processing — check your wallet or explorer.`));
    }, ms);
    promise
      .then((val) => { clearTimeout(timer); resolve(val); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
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

  // ── Priority: Wallet extension > zkLogin > localStorage zkUser ──
  // If a wallet extension is connected, use that for all operations.
  // Only fall back to zkLogin/Enoki when there is NO wallet connected.
  const hasWalletExtension = !!account?.address;
  const hasZkLogin = !!(zkLogin.address || zkUser?.address);

  const activeAddress = account?.address || zkLogin.address || zkUser?.address || null;
  const isConnected = !!activeAddress;
  // Only treat as zkLogin if there is NO wallet extension connected
  const isZkLogin = !hasWalletExtension && hasZkLogin;
  // Kept for vault owner actions restored from the GitHub version.
  // Real wallet connections still take priority; this only flags old sandbox zkLogin state.
  const isMock = !!zkUser?.isMock;

  /**
   * Executes a transaction block using either the connected wallet extension
   * or a real zkLogin (Enoki) session. All transactions go to real Sui testnet.
   *
   * Priority order:
   *   1. Wallet extension (Sui Wallet, Slush, etc.)
   *   2. zkLogin via Enoki (Google/Twitch OAuth)
   */
  const executeTransaction = useCallback(async (
    tx: Transaction,
    options?: {
      useSponsorship?: boolean;
      waitForEffects?: boolean;
      description?: string;
    }
  ): Promise<UnifiedExecutionResult> => {
    const useSponsorship = options?.useSponsorship ?? true;
    const waitForEffects = options?.waitForEffects ?? false;
    const description = options?.description || "Sui Transaction";

    const confirmInBackground = (digest: string) => {
      void withTimeout(
        suiClient.waitForTransaction({ digest }),
        TX_CONFIRMATION_TIMEOUT_MS,
        "Transaction confirmation"
      ).catch((err) => {
        console.warn(`[SuiVault] Background confirmation check failed for ${digest}:`, err);
      });
    };

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

    if (!activeAddress) {
      throw new Error("No wallet connected. Please connect your Sui wallet or sign in with zkLogin to execute transactions on testnet.");
    }

    // ─── Case 1: Wallet Extension (Sui Wallet, Slush, etc.) ───
    // This takes priority over zkLogin — the user explicitly connected a wallet.
    if (hasWalletExtension && account?.address) {
      try {
        console.log(`[SuiVault] Executing via wallet extension: ${description}`);

        // Some wallet extensions forward the payload through window.postMessage.
        // Sending the live Transaction object can throw DataCloneError because it
        // contains methods/closures. Build it into plain BCS bytes first; Uint8Array
        // is structured-clone safe and accepted by Sui wallet adapters.
        // Cast is intentional: Vercel can install duplicate @mysten/sui versions
        // through wallet-standard, making identical SuiClient types fail TS checks.
        tx.setSenderIfNotSet(account.address);
        const transactionBytes = await tx.build({ client: suiClient as any });

        const result = await signAndExecuteWallet({
          transaction: transactionBytes as any,
        });

        if (waitForEffects) {
          await withTimeout(
            suiClient.waitForTransaction({ digest: result.digest }),
            TX_CONFIRMATION_TIMEOUT_MS,
            "Transaction confirmation"
          );
        } else {
          confirmInBackground(result.digest);
        }

        recordTx(result.digest);
        return { digest: result.digest, confirmed: true };
      } catch (err: any) {
        console.error("Wallet Transaction execution failed:", err);
        if (err.message?.includes("rejected") || err.message?.includes("denied") || err.message?.includes("cancelled")) {
          throw new Error("Transaction was rejected by the wallet. Please try again.");
        }
        throw new Error(err.message || "Transaction rejected or aborted by user.");
      }
    }

    // ─── Case 2: zkLogin execution via Enoki ───
    if (isZkLogin) {
      try {
        console.log(`[SuiVault] Executing via zkLogin/Enoki: ${description}`);
        let digest: string;

        if (useSponsorship) {
          // Sponsor and execute via Enoki service (gasless for user)
          // Try the newer method name first, then fall back to the legacy one
          const flow = enokiFlow as any;
          const sponsorMethod = flow.sponsorAndExecuteTransaction
            ?? flow.sponsorAndExecuteTransactionBlock;

          if (!sponsorMethod) {
            throw new Error("Enoki sponsorship method not found. Your Enoki SDK version may be incompatible.");
          }

          const result: any = await withTimeout(
            sponsorMethod.call(flow, {
              network: "testnet",
              transaction: tx,
              transactionBlock: tx, // backwards compatibility
              client: suiClient,
            }),
            TX_CONFIRMATION_TIMEOUT_MS,
            "Enoki sponsored transaction"
          );
          digest = result.digest;
        } else {
          // User-funded: get the ephemeral keypair from the Enoki session
          const keypair = await enokiFlow.getKeypair({ network: "testnet" });
          if (!keypair) {
            throw new Error("zkLogin session keypair not found. Please re-authenticate.");
          }

          // Use the keypair's own sign-and-execute method
          const kp = keypair as any;
          const signMethod = kp.signAndExecuteTransaction ?? kp.signAndExecuteTransactionBlock;
          if (!signMethod) {
            throw new Error("Keypair sign method not found. Your Enoki SDK version may be incompatible.");
          }

          const result: any = await withTimeout(
            signMethod.call(kp, {
              transaction: tx,
              transactionBlock: tx,
              client: suiClient,
            }),
            TX_CONFIRMATION_TIMEOUT_MS,
            "zkLogin transaction"
          );
          digest = result.digest;
        }

        if (waitForEffects) {
          await withTimeout(
            suiClient.waitForTransaction({ digest }),
            TX_CONFIRMATION_TIMEOUT_MS,
            "Transaction confirmation"
          );
        } else {
          confirmInBackground(digest);
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

    // Case 3: No connected accounts
    throw new Error("No active session found. Please connect your wallet or sign in with Google/Twitch.");
  }, [activeAddress, hasWalletExtension, isZkLogin, account, signAndExecuteWallet, enokiFlow, suiClient]);

  return {
    executeTransaction,
    isConnected,
    activeAddress,
    isZkLogin,
    isMock,
    zkUser: isZkLogin ? (zkUser || { address: zkLogin.address, email: "enoki-connected@gmail.com" }) : null,
  };
}
