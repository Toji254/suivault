import { describe, expect, it, vi } from "vitest";
import { WalrusAuditClient } from "./walrus.ts";

describe("WalrusAuditClient", () => {
  it("stores JSON audit payloads on Walrus testnet and normalizes newlyCreated responses", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=5");
      expect(init?.method).toBe("PUT");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      expect(init?.body).toContain("spend_approved");
      return new Response(JSON.stringify({
        newlyCreated: {
          blobObject: {
            id: "0xblobobject",
            blobId: "real-blob-id",
          },
        },
      }), { status: 200 });
    });

    const client = new WalrusAuditClient({ fetchImpl: fetchMock as any });
    const result = await client.storeJson({ action: "spend_approved" });

    expect(result).toEqual({
      ok: true,
      blobId: "real-blob-id",
      blobObjectId: "0xblobobject",
      source: "walrus",
    });
  });

  it("reads JSON audit payloads back from the Walrus aggregator", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("https://aggregator.walrus-testnet.walrus.space/v1/blobs/blob-123");
      return new Response(JSON.stringify({ riskAssessment: { verdict: "APPROVED" } }), { status: 200 });
    });

    const client = new WalrusAuditClient({ fetchImpl: fetchMock as any });
    await expect(client.readJson("blob-123")).resolves.toEqual({ riskAssessment: { verdict: "APPROVED" } });
  });

  it("returns deterministic local proof IDs when publisher upload fails", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const client = new WalrusAuditClient({ fetchImpl: fetchMock as any });

    const result = await client.storeJson({ action: "blocked", amount: "1000" });

    expect(result.ok).toBe(false);
    expect(result.source).toBe("fallback");
    expect(result.blobId).toMatch(/^local-walrus-proof-/);
    expect(result.error).toContain("503");
  });
});
