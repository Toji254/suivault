"use client";

import { useEffect, useState, useCallback } from "react";
import { useEnokiFlow, useZkLogin } from "@mysten/enoki/react";
import { useSuiClient } from "@mysten/dapp-kit";

export interface ZkSessionUser {
  address: string;
  provider: "google" | "twitch";
  email: string;
  loginTime: number;
  jwtExpiration: number; // Unix timestamp in seconds
  maxEpoch?: number;
}

export function useZkLoginSession() {
  const enokiFlow = useEnokiFlow();
  const zkLogin = useZkLogin();
  const suiClient = useSuiClient();

  const [user, setUser] = useState<ZkSessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isExpired, setIsExpired] = useState(false);

  // Clean logout helper
  const logout = useCallback(() => {
    enokiFlow.logout();
    localStorage.removeItem("zklogin_user");
    setUser(null);
    setIsExpired(false);
    // Dispatch event to sync other listening components (like Navbar)
    window.dispatchEvent(new Event("zklogin-auth-change"));
  }, [enokiFlow]);

  // Check if session has expired (either token expiry or Sui epoch limit)
  const checkSessionExpiry = useCallback(async (session: ZkSessionUser) => {
    const currentTimeSec = Math.floor(Date.now() / 1000);

    // 1. Time-based JWT check
    if (currentTimeSec >= session.jwtExpiration) {
      console.warn("zkLogin token has expired in time.");
      setIsExpired(true);
      return true;
    }

    // 2. Epoch-based check against Sui blockchain
    if (session.maxEpoch) {
      try {
        const sysState = await suiClient.getLatestSuiSystemState();
        const currentEpoch = Number(sysState.epoch);
        if (currentEpoch > session.maxEpoch) {
          console.warn(`zkLogin session expired. Current epoch: ${currentEpoch}, Max epoch: ${session.maxEpoch}`);
          setIsExpired(true);
          return true;
        }
      } catch (err) {
        console.error("Failed to query Sui epoch state:", err);
      }
    }

    setIsExpired(false);
    return false;
  }, [suiClient]);

  // Sync state on mount and when zkLogin values change
  useEffect(() => {
    const handleSync = async () => {
      setLoading(true);
      
      // Attempt to load metadata from localStorage
      const cached = localStorage.getItem("zklogin_user");
      let parsedUser: ZkSessionUser | null = null;
      
      if (cached) {
        try {
          parsedUser = JSON.parse(cached);
        } catch (e) {
          console.error("Corrupted local zkLogin session:", e);
        }
      }

      // If Enoki state has active address, hydrate/update metadata
      if (zkLogin.address) {
        const decoded = (enokiFlow as any).getDecodedIdToken();
        const expiration = decoded?.exp || Math.floor(Date.now() / 1000) + 3600; // default 1 hour
        const maxEpoch = decoded?.max_epoch ? Number(decoded.max_epoch) : undefined;
        const email = decoded?.email || parsedUser?.email || "enoki-connected@gmail.com";

        const updatedUser: ZkSessionUser = {
          address: zkLogin.address,
          provider: (zkLogin.provider as any) || "google",
          email: email,
          loginTime: parsedUser?.loginTime || Date.now(),
          jwtExpiration: expiration,
          maxEpoch,
        };

        localStorage.setItem("zklogin_user", JSON.stringify(updatedUser));
        setUser(updatedUser);
        await checkSessionExpiry(updatedUser);
      } else if (parsedUser) {
        // If Enoki hook hasn't loaded yet but metadata exists, verify expiry
        const expired = await checkSessionExpiry(parsedUser);
        if (expired) {
          logout();
        } else {
          setUser(parsedUser);
        }
      } else {
        setUser(null);
      }
      
      setLoading(false);
    };

    handleSync();

    // Listen to local changes
    window.addEventListener("zklogin-auth-change", handleSync);
    return () => {
      window.removeEventListener("zklogin-auth-change", handleSync);
    };
  }, [zkLogin.address, zkLogin.provider, enokiFlow, logout, checkSessionExpiry]);

  return {
    user,
    loading: loading || zkLogin.isLoading,
    isExpired,
    logout,
    checkExpiry: () => user && checkSessionExpiry(user),
  };
}
