import type { Vault, VaultKey } from "./types.js";

export interface RiskFactor {
  name: string;
  passed: boolean;
  score: number;
}

export interface RiskAssessment {
  riskScore: number;
  verdict: "APPROVED" | "BLOCKED";
  factors: RiskFactor[];
}

export interface AuditLogPayload {
  timestamp: number;
  agentAddress: string;
  vaultId: string;
  intent: {
    action: string;
    amount: string;
    recipient: string;
    pool?: string;
    price?: string;
  };
  riskAssessment: RiskAssessment;
  explanation: string;
}

export interface GuardianVerdict {
  allowed: boolean;
  reason?: string;
  /** Compatibility alias for implementation-plan consumers and mock/offline flows. */
  mockBlobId: string;
  walrusBlobId: string;
  payload: AuditLogPayload;
}

export class AiRiskGuardian {
  /**
   * Evaluates the spend request against vault policy and dynamic risk factors.
   * Simulates uploading the rich audit log JSON to Walrus.
   */
  async evaluateSpend(
    vault: Vault,
    key: VaultKey,
    amount: bigint,
    recipient: string,
    isDeepBook: boolean = false,
    pool?: string,
    price?: bigint
  ): Promise<GuardianVerdict> {
    const timestamp = Date.now();
    const factors: RiskFactor[] = [];
    let riskScore = 0;

    // Check 1: Whitelist check
    if (vault.policy.allowedRecipients.length > 0) {
      const isWhitelisted = vault.policy.allowedRecipients.includes(recipient);
      factors.push({
        name: "recipient_whitelisted",
        passed: isWhitelisted,
        score: isWhitelisted ? 0 : 0.7,
      });
      if (!isWhitelisted) riskScore += 0.7;
    } else {
      factors.push({
        name: "recipient_whitelisted",
        passed: true,
        score: 0,
      });
    }

    // Check 2: Transaction limit check
    const exceedsTxLimit = vault.policy.maxPerTx > 0n && amount > vault.policy.maxPerTx;
    factors.push({
      name: "under_tx_limit",
      passed: !exceedsTxLimit,
      score: exceedsTxLimit ? 0.5 : 0.05,
    });
    if (exceedsTxLimit) riskScore += 0.5;

    // Check 3: Daily budget check
    const todaySpentBig = BigInt(vault.todaySpent);
    const dailyMaxBig = vault.policy.maxPerDay;
    const exceedsDaily = dailyMaxBig > 0n && todaySpentBig + amount > dailyMaxBig;
    factors.push({
      name: "under_daily_limit",
      passed: !exceedsDaily,
      score: exceedsDaily ? 0.6 : 0.1,
    });
    if (exceedsDaily) riskScore += 0.6;

    // Check 4: DeepBook price checks (if applicable)
    if (isDeepBook && pool && price !== undefined) {
      const isCorrectPool = vault.policy.deepbookPool === pool;
      const priceTooHigh = price > vault.policy.maxPrice;
      const priceTooLow = price < vault.policy.minPrice;
      
      factors.push({
        name: "deepbook_pool_valid",
        passed: isCorrectPool,
        score: isCorrectPool ? 0 : 0.8,
      });
      if (!isCorrectPool) riskScore += 0.8;

      factors.push({
        name: "deepbook_price_within_range",
        passed: !priceTooHigh && !priceTooLow,
        score: (priceTooHigh || priceTooLow) ? 0.6 : 0,
      });
      if (priceTooHigh || priceTooLow) riskScore += 0.6;
    }

    // Normalize risk score between 0 and 1
    const finalRiskScore = Math.min(Math.max(riskScore, 0), 1);
    const allowed = finalRiskScore < 0.5;
    const verdict = allowed ? "APPROVED" : "BLOCKED";

    // Explanations
    let explanation = "";
    if (allowed) {
      explanation = `Spend of ${amount.toString()} MIST is approved. Risk score is low (${finalRiskScore.toFixed(2)}).`;
    } else {
      explanation = `Blocked: Risk score is too high (${finalRiskScore.toFixed(2)}). Failed checks: ${factors
        .filter((f) => !f.passed)
        .map((f) => f.name)
        .join(", ")}.`;
    }

    const payload: AuditLogPayload = {
      timestamp,
      agentAddress: key.agentAddress,
      vaultId: key.vaultId,
      intent: {
        action: isDeepBook ? "spend_for_deepbook_order" : "spend",
        amount: amount.toString(),
        recipient,
        pool,
        price: price?.toString(),
      },
      riskAssessment: {
        riskScore: finalRiskScore,
        verdict,
        factors,
      },
      explanation,
    };

    const payloadStr = JSON.stringify(payload);
    let walrusBlobId = "walrus-blob-" + this.simpleHash(payloadStr);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4 seconds timeout
      
      const res = await fetch("https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=5", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: payloadStr,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const uploadInfo = await res.json();
        if (uploadInfo.newlyCreated?.blobObject?.blobId) {
          walrusBlobId = uploadInfo.newlyCreated.blobObject.blobId;
        } else if (uploadInfo.alreadyCertified?.blobId) {
          walrusBlobId = uploadInfo.alreadyCertified.blobId;
        }
      }
    } catch (e) {
      console.warn("Walrus publisher upload failed, using fallback hash:", e);
    }

    return {
      allowed,
      reason: allowed ? undefined : explanation,
      mockBlobId: walrusBlobId,
      walrusBlobId,
      payload,
    };
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
}
